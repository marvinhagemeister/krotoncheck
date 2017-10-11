'use strict';

module.exports = function*(season) {
	const data = season.data;

	for (const tm of data.teammatches) {
		if (!tm.flag_ok_gegen_team1 && !tm.flag_ok_gegen_team2) {
			continue;
		}

		if (! data.get_stb_note(tm.matchid, note_text => /F(?:01|37)/.test(note_text))) {
			const contains_o = !!data.get_stb_note(tm.matchid, note_text => /FO1/.test(note_text));
			const contains_f13 = !!data.get_stb_note(tm.matchid, note_text => /F13/.test(note_text));
			const contains_og = !!data.get_stb_note(tm.matchid, note_text => /OG|Ordnungsgebühr/.test(note_text));

			const message = (
				'Mannschaftsspiel ohne Kampf, aber Ordnungsgebühr F01 oder F37 gegen ' +
				(tm.flag_ok_gegen_team1 ? 'Heimmannschaft (' + tm.team1name + ')' : 'Gastmannschaft (' + tm.team2name + ')')
				+ ' fehlt.' +
				(contains_o ? ' (F01 mit o statt Null geschrieben?)' : '') +
				((contains_og && !contains_f13) ? ' (Ordnungsgebühr-Kennung F01/F37 vergessen?)' : '') +
				(contains_f13 ? ' (Ordnungsgebühr F13 verhängt)' : '')
			);
			yield {
				teammatch_id: tm.matchid,
				message,
			};
		}
	}
};
