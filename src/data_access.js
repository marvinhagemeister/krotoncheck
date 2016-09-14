'use strict';

var async = require('async');
var atomic_write = require('atomic-write');
var Baby = require('babyparse');
var fs = require('fs');
var path = require('path');


const ALL_TASKS = [
    'players',
    'playermatches',
    'teammatches',
    'clubs',
    'playerteam',
    'locations',
    'clubranking',
    'matchfields',
    'teams',
];


function parse_bool(val) {
	if (val === 'true') {
		return true;
	} else if (val === 'false') {
		return false;
	} else {
		throw new Error('Invalid boolean value ' + JSON.stringify(val));
	}
}

function enrich(season, data) {
	var player_by_id = new Map();
	for (let p of data.players) {
		player_by_id.set(p.spielerid, p);
	}

	var team_by_id = new Map();
	for (let t of data.teams) {
		team_by_id.set(t.code, t);
	}

	var teammatch_by_id = new Map();
	for (let tm of data.teammatches) {
		teammatch_by_id.set(tm.matchid, tm);
	}

	var playermatches_by_teammatchid = new Map();
	for (let pm of data.playermatches) {
		let pms = playermatches_by_teammatchid.get(pm.teammatchid);
		if (! pms) {
			pms = [];
			playermatches_by_teammatchid.set(pm.teammatchid, pms);
		}
		pms.push(pm);
	}

	data.active_teammatches = [];
	let active_teammatch_ids = new Set();
	for (let tm of data.teammatches) {
		for (let bool_key of [
				'flag_ok_gegen_team1',
				'flag_ok_gegen_team2',
				'flag_umwertung_gegen_team1',
				'flag_umwertung_gegen_team2',
				'flag_umwertung_gegen_team1_beide',
				'flag_umwertung_gegen_team2_beide',
				'flag_umwertung_gegen_beide',
				]) {
			tm[bool_key] = parse_bool(tm[bool_key]);
		}

		let t1 = team_by_id.get(tm.team1id);
		if (!t1) {
			throw new Error('Team1 (ID: ' + tm.team1id + ')  in teammatch ' + tm.matchid + ' is missing');
		}
		let t2 = team_by_id.get(tm.team2id);
		if (!t2) {
			throw new Error('Team2 (ID: ' + tm.team2id + ')  in teammatch ' + tm.matchid + ' is missing');
		}
		let ohne_kampf = tm.flag_ok_gegen_team1 || tm.flag_ok_gegen_team2;

		if (! (t1.Status || t2.Status || ohne_kampf)) {
			data.active_teammatches.push(tm);
			active_teammatch_ids.add(tm.matchid);
		}
	}

	data.active_playermatches = [];
	data.played_playermatches = [];
	for (let pm of data.playermatches) {
		for (let int_key of [
				'matchtypeno',
				'winner',
				'setcount',
				'set1team1',
				'set1team2',
				'set2team1',
				'set2team2',
				'set3team1',
				'set3team2']) {
			pm[int_key] = parse_int(pm[int_key]);
		}
		for (let bool_key of ['flag_keinspiel_keinespieler', 'flag_keinspiel_keinspieler_team1', 'flag_keinspiel_keinspieler_team2', 'flag_aufgabe_team1', 'flag_aufgabe_team2', 'flag_umwertung_gegen_team1', 'flag_umwertung_gegen_team2']) {
			pm[bool_key] = parse_bool(pm[bool_key]);
		}

		if (!active_teammatch_ids.has(pm.teammatchid)) {
			continue;
		}

		data.active_playermatches.push(pm);

		let not_played = pm.flag_keinspiel_keinespieler || pm.flag_keinspiel_keinspieler_team1 || pm.flag_keinspiel_keinspieler_team2;
		if (! not_played) {
			data.played_playermatches.push(pm);
		}
	}

	data.get_player = function(player_id) {
		var res = player_by_id.get(player_id);
		if (!res) {
			throw new Error('Konnte Spieler ' + JSON.stringify(player_id) + ' nicht finden');
		}
		return res;
	};
	data.get_teammatch = function(teammatch_id) {
		var res = teammatch_by_id.get(teammatch_id);
		if (!res) {
			throw new Error('Konnte Spiel ' + JSON.stringify(teammatch_id) + ' nicht finden');
		}
		return res;
	};
	data.get_playermatches_by_teammatch_id = function(teammatch_id) {
		var res = playermatches_by_teammatchid.get(teammatch_id);
		if (!res) {
			throw new Error('Konnte Spiel ' + JSON.stringify(teammatch_id) + ' nicht finden');
		}
		return res;
	};
	data.player_name = function(p) {
		return p.vorname + ' ' + p.name;
	};
	data.match_name = function(pm) {
		var res = pm.disziplin;
		if (pm.matchtypeno) {
			res = pm.matchtypeno + '. ' + res;
		}
		return res;
	};
}

function load_data(dirname, tasks, callback) {
	let data = {};
	async.each(tasks, function(task_name, cb) {
		var csv_fn = path.join(dirname, task_name + '.csv');
		parse_csv(csv_fn, function(err, lines) {
			if (err) return cb(err);

			data[task_name] = lines;
			cb(err);
		});
	}, err => callback(err, data));
}

function load_data_cached(dirname, tasks, callback) {
	var json_fn = path.join(dirname, 'cachev1.json');
	fs.readFile(json_fn, {encoding: 'utf8'}, function(err, fcontents) {
		if (err) {
			load_data(dirname, tasks, function(err, data) {
				if (err) return callback(err);

				atomic_write.writeFile(json_fn, JSON.stringify(data), {encoding: 'utf8'}, function(err) {
					callback(err, data);
				});
			});
		} else {
			let data = JSON.parse(fcontents);
			callback(null, data);
		}
	});
}

function parse_csv(fn, cb) {
    // It seems crazily inefficient to read the file into memory,
    // but that seems to be the fastest way
    // See https://github.com/phihag/csv-speedtest for speed test
    fs.readFile(fn, {encoding: 'binary'}, function(err, fcontents) {
        if (err) return cb(err);
        fcontents = fcontents.trim();

        Baby.parse(fcontents, {
            header: true,
            complete: function(res) {
                if (res.errors.length > 0) {
                    return cb(new Error('Failed to parse ' + fn + ': ' + JSON.stringify(res.errors)));
                }
                var lines = res.data;
                cb(null, lines);
            },
        });
    });
}

function parse_int(s) {
	let res = parseInt(s, 10);
	if (isNaN(s)) {
		throw new Error('Failed to parse integer from ' + JSON.stringify(s));
	}
	return res;
}

module.exports = {
	enrich,
	load_data_cached,
	load_data,
	ALL_TASKS,
	parse_bool: parse_bool,
};