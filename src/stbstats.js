'use strict';

const path = require('path');

const data_access = require('./data_access');
const loader = require('./loader');
const render = require('./render');
const utils = require('./utils');
const worker_utils = require('./worker_utils');

function quantile(ar, q) {
	ar.sort(function(a, b) {
		return a - b;
	});

	const idx = q * (ar.length - 1);
	if (idx === Math.floor(idx)) {
		return ar[idx];
	} else {
		return (ar[Math.floor(idx)] + ar[Math.ceil(idx)]) / 2;
	}
}

function average(ar) {
	let sum = 0;
	for (const el of ar) {
		sum += el;
	}
	return sum / ar.length;
}

function show_handler(req, res, next) {
	const season_key = req.params.season_key;
	const region_filter = req.query.region || req.query.r;
	const worker_fn = path.join(__dirname, 'stbstats_worker.js');
	req.app.db.efetch_all(next, [{
		queryFunc: '_findOne',
		collection: 'seasons',
		query: {key: season_key},
	}], function(season) {
		worker_utils.in_background(worker_fn, season, function(err, wr) {
			if (err) return next(err);

			let stats = wr.stats;
			if (region_filter) {
				stats = stats.filter(s => {
					return !s.regions_str || s.regions_str.includes(region_filter);
				});
			}

			render(req, res, next, 'stbstats_show', {
				season,
				stats,
				region_filter,
				extended: req.query.hasOwnProperty('extended') || req.query.hasOwnProperty('e'),
			});
		});
	});
}

function calc_ms(data, tm, stb_name, now) {
	if (!tm.detailergebnis_eintragedatum) {
		return; // Not entered yet
	}

	if (/\(A\)/.test(tm.detailergebnis_user) || (tm.detailergebnis_user === tm.ergebnisbestaetigt_user)) {
		return; // Entered by StB/admin
	}

	const entered = utils.parse_date(tm.detailergebnis_eintragedatum);
	const handled_ar = [];
	if (tm.ergebnisbestaetigt_datum) {
		handled_ar.push(utils.parse_date(tm.ergebnisbestaetigt_datum));
	}

	const notes = data.get_all_notes(tm.matchid);
	if (notes) {
		for (const note of notes) {
			if (note.benutzer !== stb_name) {
				continue;
			}
			const ts = utils.parse_date(note.zeitpunkt);
			if (ts < entered) {
				continue;
			}
			handled_ar.push(ts);
		}
	}

	if (handled_ar.length === 0) {
		return now - entered; // Not yet handled
	}

	const handled = Math.min.apply(null, handled_ar);
	if (entered > handled) {
		return;
	}

	return handled - entered;
}

function calc_stats(durations_by_stb, regions_by_stb, groups_by_stb) {
	const res = [];
	for (const [stb_name, durs] of durations_by_stb.entries()) {
		const stb_regions = regions_by_stb.get(stb_name) || [];
		const stb_groups = groups_by_stb.get(stb_name) || [];
		const regions_ar = Array.from(stb_regions);
		regions_ar.sort();
		const regions_str = regions_ar.join(',');
		res.push({
			stb_name,
			median: quantile(durs, 0.5),
			q95: quantile(durs, 0.95),
			avg: average(durs),
			count: durs.length,
			groups: stb_groups,
			group_count: stb_groups.length,
			regions_str,
		});
	}
	res.sort(utils.cmp_key('median'));
	return res;
}

function run_calc(season, cb) {
	loader.load_season_data(season, (err) => {
		if (err) return cb(err);

		data_access.enrich(season);

		const data = season.data;
		const durations_by_stb = new Map();
		const regions_by_stb = new Map();
		const groups_by_stb = new Map();
		const now = Date.now();
		for (const tm of data.teammatches) {
			const stb = data.get_stb(tm);
			const stb_name = stb.firstname + ' ' + stb.lastname;

			const region = data.get_region(tm.eventname);
			const stb_regions = utils.setdefault(regions_by_stb, stb_name, () => new Set());
			stb_regions.add(region);

			const duration = calc_ms(data, tm, stb_name, now);
			if (duration === undefined) {
				continue;
			}

			let stb_durations = utils.setdefault(durations_by_stb, stb_name, () => []);
			stb_durations.push(duration);

			let region_durations = utils.setdefault(durations_by_stb, region, () => []);
			region_durations.push(duration);

			const group_id = tm.staffelcode;
			let stb_groups = utils.setdefault(groups_by_stb, stb_name, () => []);
			if (!stb_groups.includes(group_id)) {
				stb_groups.push(group_id);
			}
			let region_groups = utils.setdefault(groups_by_stb, region, () => []);
			if (!region_groups.includes(group_id)) {
				region_groups.push(group_id);
			}
		}

		const stats = calc_stats(durations_by_stb, regions_by_stb, groups_by_stb);
		cb(null, stats);
	});
}

module.exports = {
	show_handler,
	run_calc,
};
