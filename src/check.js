'use strict';

var async = require('async');
var fs = require('fs');

var data_access = require('./data_access');
var downloads = require('./downloads');
var utils = require('./utils');
var problems = require('./problems');


const CHECK_NAMES = fs.readdirSync(__dirname + '/checks').filter(fn => /\.js$/.test(fn)).map(fn => /^(.*)\.js$/.exec(fn)[1]);
const CHECKS_BY_NAME = utils.map_obj(CHECK_NAMES, cn => require('./checks/' + cn));
const CHECKS = utils.values(CHECKS_BY_NAME);


// Yields all problems
function* check(season, data) {
	data_access.enrich(season, data);

	if (!season.check_now) {
		season.check_now = Date.now();
	}

	// TODO catch errors by the checkers and emit them as well
	for (var check of CHECKS) {
		yield* check(season, data);
	}
}

// Runs a new check and stores the results in the database
// cb gets called with err, if any
function recheck(db, season_key, callback, store=false) {
	async.waterfall([function(cb) {
		db.fetch_all([{
			queryFunc: '_findOne',
			collection: 'seasons',
			query: {key: season_key},
		}], cb);
	}, function(season, cb) {
		downloads.load_season_data(season, function(err, data) {
			cb(err, season, data);
		});
	}, function(season, data, cb) {
		var found = Array.from(check(season, data));
		problems.enrich(data, season, found);

		if (!store) {
			console.log('found problems', found);
			return cb(null, found);
		}
		problems.store(db, season, found, cb);
	}], callback);
}


module.exports = {
	recheck,
	CHECKS,
	CHECKS_BY_NAME,
	CHECK_NAMES,
};