'use strict';

const laws = require('../laws.js');
const utils = require('../utils.js');

module.exports = function*(season) {
	const data = season.data;

	for (const team of data.teams) {
		if (team.Status === 'Mannschaftsrückzug') {
			continue;
		}

		const forced = laws.forced_retreat(data, team.code);
		if (forced) {
			const tms = data.get_teammatches_by_team_id(team.code);
			if (tms[tms.length - 1].matchid === forced.matchid) {
				return; // Final match: Special case (by mail from Miles Eggers)
			}

			const message = (
				'(' + team.code + ') ' + team.name + ' hat am ' + utils.ts2dstr(forced.ts) +
				' zum dritten Mal kampflos aufgegeben,' +
				' ist aber nicht als zurückgezogen markiert (§68.2b SpO)'
			);
			yield {
				teammatch_id: forced.matchid,
				message,
			};
		}
	}
};