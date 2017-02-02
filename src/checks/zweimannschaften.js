'use strict';
// 2 teams of one club in the same group

const data_utils = require('../data_utils');
const utils = require('../utils');


function* get_double_teams(data) {
	const groups = new Map(); // Contents: Map clubCode -> array of teams
	for (const team of data.teams) {
		let g = groups.get(team.DrawID);
		if (!g) {
			g = new Map();
			groups.set(team.DrawID, g);
		}

		let by_club = g.get(team.clubcode);
		if (!by_club) {
			by_club = [];
			g.set(team.clubcode, by_club);
		}

		by_club.push(team);
	}

	for (const [gid, g] of groups.entries()) {
		for (const teams of g.values()) {
			if (['U19', 'Mini'].includes(data_utils.league_type(gid)) && (teams.length > 2)) {
				continue; // Do not check youth teams when >= 3 teams of the same club are in one group
			}

			if (teams.length > 1) {
				yield* teams;
			}
		}
	}
}

function* check_team(data, team) {
	const all_matches = data.get_teammatches_by_team_id(team.code);
	if (! all_matches) {
		return; // Bundesliga team?
	}
	const rounds = data_utils.matches_by_round(all_matches);
	for (const matches of rounds) {
		let played_other = null;

		for (const tm of matches) {
			const other_team_id = (tm.team1id === team.code) ? tm.team2id : tm.team1id;
			const other_team = data.get_team(other_team_id);

			if (other_team.clubcode === team.clubcode) {
				if (played_other) {
					const message = (
						'Zwei Mannschaften eines Vereins sollten immer zuerst gegeneinander spielen (§35.5 SpO). ' +
						data_utils.tm_str(tm) + ' wurde erst ' + utils.ts2destr(tm.ts) + ' gespielt, nach ' +
						data_utils.tm_str(played_other) + ' am ' + utils.ts2destr(played_other.ts) + '.'
					);
					yield {
						teammatch_id: tm.matchid,
						message,
					};
					continue; // Do not report any more for this round
				}
			} else if (!played_other) {
				played_other = tm;
			}
		}
	}
}

module.exports = function*(season) {
	const double_teams = get_double_teams(season.data);
	for (const team of double_teams) {
		yield* check_team(season.data, team);
	}
};