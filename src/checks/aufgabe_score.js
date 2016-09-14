'use strict';

function is_winner(candidate, other) {
	return (
		((candidate == 21) && (other < 20)) ||
		((candidate > 21) && (candidate <= 30) && (other == candidate - 2)) ||
		(candidate == 30) && (other == 29)
	);
}

function game_winner(pm, game_idx) {
	let p1 = pm['set' + game_idx + 'team1'];
	let p2 = pm['set' + game_idx + 'team2'];

	if (is_winner(p1, p2)) {
		return 1;
	}
	if (is_winner(p2, p1)) {
		return 2;
	}
	return 0;
}

function match_winner(pm) {
	let games = [0, 0];
	for (let i = 1;i <= pm.setcount;i++) {
		let gwinner = game_winner(pm, i);
		if (!gwinner) {
			break;
		}
		games[gwinner - 1]++;

		if (games[0] === 2) {
			return 1;
		} else if (games[1] === 2) {
			return 2;
		}
	}
	return 0;
}

function* check_match(data, pm, team_idx) {
	if (! pm['flag_aufgabe_team' + team_idx]) {
		return;
	}

	if (! pm['team' + team_idx + 'spieler1spielerid']) {
		yield {
			teammatch_id: pm.teammatchid,
			match_id: pm.matchid,
			message: 'Aufgebende Seite hat keine Spieler (nicht gespielt?)',
		};
		return;
	}

	let mw = match_winner(pm);
	if (mw === 3 - team_idx) {
		return; // everything in order
	}

	let tm = data.get_teammatch(pm.teammatchid);
	let msg = (
		(mw === 0) ?
		'Bei Aufgabe muss der Punktestand zum Gewinn(z.B. 21) ergänzt werden' :
		'Aufgebende Seite (' + tm['team' + team_idx + 'name'] + ') hatte bereits gewonnen');

	yield {
		teammatch_id: pm.teammatchid,
		match_id: pm.matchid,
		message: msg,
	};

}


module.exports = function*(season, data) {
	for (var pm of data.played_playermatches) {
		yield* check_match(data, pm, 1);
		yield* check_match(data, pm, 2);
	}
};