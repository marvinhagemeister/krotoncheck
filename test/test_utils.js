'use strict';

var assert = require('assert');

var utils = require('../src/utils');


describe('utils', function() {
	it('parse_date', function() {
		assert.strictEqual(utils.parse_date('11.11.2016 17:48:13'), 1478882893000);
		assert.strictEqual(utils.parse_date('14.11.2016 12:00:00'), 1479121200000);
		

	});

	it('weekday', function() {
		assert.strictEqual(utils.weekday(1478882893000), 5);
		assert.strictEqual(utils.weekday(1479121200000), 1);
	});

	it('monday_1200', function() {
		assert.strictEqual(utils.monday_1200(utils.parse_date('11.11.2016 17:48:13')), 1479121200000);
		assert.strictEqual(utils.monday_1200(utils.parse_date('12.11.2016 12:01:02')), 1479121200000);
		assert.strictEqual(utils.monday_1200(utils.parse_date('13.11.2016 23:59:59')), 1479121200000);
		assert.strictEqual(utils.monday_1200(utils.parse_date('14.11.2016 23:59:59')), 1479121200000 + 7 * 24 * 3600000);
	});

});
