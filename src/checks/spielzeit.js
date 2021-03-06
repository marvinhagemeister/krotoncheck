'use strict';

const utils = require('../utils');
const data_utils = require('../data_utils');


function has_late_note(data, tm) {
	return !! data.get_stb_note(tm.matchid, ntext => /[fF](?:04|24|38)/.test(ntext));
}

function has_any_note(data, tm) {
	return !! data.get_stb_note(tm.matchid, () => true);
}

function has_stb_comment_after(data, tm, after) {
	const comments = data.get_comments(tm.matchid);
	const stb = data.get_stb(tm);
	if (!stb) {
		return;
	}
	const stb_name = stb.firstname + ' ' + stb.lastname;

	return comments.some(c => {
		if (! c.benutzer.startsWith(stb_name)) {
			return false;
		}
		const comment_date = utils.parse_date(c.zeitpunkt);

		return comment_date >= after;
	});
}

function* check_tm(season, tm) {
	const data = season.data;
	const now = season.check_now;
	const HOUR = 3600000;
	const GRACE_TIME_BEFORE = 15 * 60000; // Some teams enter their line-up before the start
	const REPORT_TEAM_RLOL = 6 * HOUR;

	const league_type = data_utils.league_type(tm.staffelcode);
	const original_ts = utils.parse_date(tm.datum_verbandsansetzung);
	const original_weekday = utils.weekday(original_ts);
	const original_timestr = utils.ts2timestr(original_ts);
	const is_olrl = /^01-00[123]$/.test(tm.staffelcode);
	if (!is_olrl && (league_type === 'O19') && ((original_weekday !== 6) || (original_timestr !== '18:00:00'))) {
		const message = (
			'Verbandsansetzung nicht Samstag 18:00, sondern ' + utils.weekday_destr(original_ts) + ' ' + utils.ts2destr(original_ts) + ' (§45.2a SpO)'
		);
		yield {
			teammatch_id: tm.matchid,
			message,
		};
	} else if (((league_type === 'Mini') || (league_type === 'U19')) && ((original_weekday != 6) || (original_timestr != '15:00:00'))) {
		const message = (
			'Verbandsansetzung nicht Samstag 15:00, sondern ' + utils.weekday_destr(original_ts) + ' ' + utils.ts2destr(original_ts) + ' (§45.2b SpO)'
		);
		yield {
			teammatch_id: tm.matchid,
			message,
		};
	}

	// After last possible day?
	const played = utils.parse_date(tm.spieldatum);
	const lastdate_str = season['lastdate_' + (is_olrl ? 'olrl' : ((league_type === 'O19') ? 'o19' : 'u19'))];
	if (lastdate_str) {
		let last_ts = utils.parse_date(lastdate_str);
		if (utils.ts2timestr(last_ts) === '00:00:00') {
			// Entered the day, let's take nearly one day more
			last_ts += 24 * 60 * 60 * 1000 - 1;
		}
		if (played > last_ts) {
			const message = (
				'Spiel auf ' + tm.spieldatum + ' verlegt, nach letztem Spieltag ' + utils.ts2destr(last_ts) +
				' (§46.1e SpO)'
			);
			yield {
				teammatch_id: tm.matchid,
				message,
			};
		}
	}

	if (tm.flag_ok_gegen_team1 || tm.flag_ok_gegen_team2) {
		return; // Not played at all
	}
	if (tm.flag_umwertung_gegen_beide) {
		return; // Played at invalid date
	}

	const team_entered = tm.mannschaftsergebnis_eintragedatum ? utils.parse_date(tm.mannschaftsergebnis_eintragedatum) : null;
	const entered = tm.detailergebnis_eintragedatum ? utils.parse_date(tm.detailergebnis_eintragedatum) : null;
	if (team_entered !== null) {
		if (team_entered < played) {
			const message = (
				'Mannschaftsergebnis vor Spieldatum eingetragen ' +
				'(' + tm.mannschaftsergebnis_eintragedatum +
				' vor ' + tm.spieldatum + ')' +
				' - nicht eingetragene Vorverlegung?');
			yield {
				teammatch_id: tm.matchid,
				message,
			};
		}
	}
	if (entered !== null) {
		if (entered < played - GRACE_TIME_BEFORE) {
			const message = (
				'Detailergebnis vor Spieldatum eingetragen ' +
				'(' + tm.detailergebnis_eintragedatum +
				' vor ' + tm.spieldatum + ')' +
				' - nicht eingetragene Vorverlegung?');
			yield {
				teammatch_id: tm.matchid,
				message,
			};
		}
	}

	if (has_late_note(data, tm)) {
		return;
	}

	if (tm.mannschaftsergebnis_user.endsWith('(A)')) {
		// Changed by admin
		return;
	}

	const team1 = data.get_team(tm.team1id);
	const team2 = data.get_team(tm.team2id);
	if ((team1.Status === 'Mannschaftsrückzug') || (team2.Status === 'Mannschaftsrückzug')) {
		return;
	}

	if (is_olrl) {
		if (entered) {
			if (played + REPORT_TEAM_RLOL < entered) {
				const message = (
					'Detailergebnis zu spät eingetragen: ' +
					'Spiel um ' + tm.spieldatum + ', ' +
					'aber erst eingetragen um ' + utils.ts2destr(entered) +
					' (vgl. §4.1 Anlage 6 SpO)');
				yield {
					teammatch_id: tm.matchid,
					message,
				};
			}
		} else {
			if (played + REPORT_TEAM_RLOL < now) {
				const message = (
					'Detailergebnis zu spät eingetragen: ' +
					'Spiel um ' + tm.spieldatum + ', ' +
					'aber immer noch nicht eingetragen' +
					' (vgl. §4.1 Anlage 6 SpO)');
				yield {
					teammatch_id: tm.matchid,
					message,
				};
			}
		}
	}

	const GRACE_MINUTE = 60 * 1000 - 1; // The regulations just say 12:00, not 12:00:00
	const report_until = (
		[6, 0].includes(utils.weekday(played)) ?
		(utils.monday_1200(played) + GRACE_MINUTE)
		: (played + 48 * HOUR));
	if (entered) {
		if (report_until < entered) {
			const message = (
				'Detailergebnis zu spät eingetragen: ' +
				'Spiel am ' + utils.weekday_destr(played) + ', ' + tm.spieldatum + ', ' +
				'aber erst eingetragen am ' + utils.weekday_destr(entered) + ', ' + utils.ts2destr(entered));
			yield {
				teammatch_id: tm.matchid,
				message,
			};
		}
	} else {
		if (report_until < now) {
			const message = (
				'Detailergebnis zu spät eingetragen: ' +
				'Spiel um ' + utils.weekday_destr(played) + ', ' + tm.spieldatum + ', ' +
				'aber noch nicht eingetragen' +
				' (Termin nicht aktuell, Nachverlegung oder Spiel endgültig ausgefallen?)');
			yield {
				teammatch_id: tm.matchid,
				message,
			};
		}
	}

	const TIMELY_REPORT = (is_olrl ? 24 : 48) * HOUR;
	if (entered
			&& !tm.ergebnisbestaetigt_datum &&
			(report_until + TIMELY_REPORT < now) &&
			!has_any_note(data, tm) &&
			!has_stb_comment_after(data, tm, entered)) {
		const message = (
			data_utils.tm_str(tm) + ' noch nicht vom StB bearbeitet' +
			' (Spiel am ' + utils.weekday_destr(played) + ', ' + tm.spieldatum +
			', Detailergebnis eingetragen am ' + utils.weekday_destr(entered) + ', ' + utils.ts2destr(entered) + ')'
		);
		yield {
			message,
			teammatch_id: tm.matchid,
			teammatch2_id: tm.matchid,
			type: 'latenote',
		};
	}
}

module.exports = function*(season) {
	for (const tm of season.data.teammatches) {
		yield* check_tm(season, tm);
	}
};