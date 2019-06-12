'use strict';

/*
 * Holds the path to the data.json file.
 */
const dataPath = chrome.runtime.getURL('data/data.json');

/*
 * Saves the content of the data.json file.
 */
var data;

/*
 * Executes this content script when the webpage has loaded. This script performs fake actions
 * on faked connections according to a given algorithm.
 */
$(document).ready(function () {
	fetch(dataPath).then(response => response.json()).then(function (json) {
		// Save json content in variable to make it accessible elsewhere
		data = json;

		// Tell the background script when window is resized
		window.addEventListener('resize', function (event) {
			chrome.runtime.sendMessage({
				type: 'resize',
				width: event.target.outerWidth,
				height: event.target.outerHeight
			}, function (response) {});
		});

		// For finding out url parameter.
		chrome.runtime.sendMessage({
			type: 'isSpecial',
			url: location.href
		}, function (response) {
			if (response.isSpecial && response.disconnect != undefined) {
				disconnect(true);
			} else if (response.isSpecial && response.disconnect == undefined) {
				getUrlParams();
			}
		});

		chrome.runtime.sendMessage({
			type: 'isExec'
		}, function (response) {
			// Only run this script for tabs created by this extension.
			if (response.isExec) {
				updateStatus(location.href, 'OPEN', '&ndash;', '&ndash;');
				updateStatistics('visitedSitesCount');

				switch (response.algo) {
					case data.availableAlgorithms.DEFAULT:
						setTimeout(disconnect, weightedRandom(5000, weightedRandom(1000)));
						break;
					case data.availableAlgorithms.NAVIGATE:
						navigatePage(weightedRandom(8000, 500));
						break;
					case data.availableAlgorithms.SEARCH:
						searchPage(weightedRandom(8000, 1000));
						break;
				}
			} else if (response.disconnect) {
				setTimeout(disconnect, weightedRandom(5000, weightedRandom(1000)));
			}
		});
	});
});

/**
 * Closes the current tab.
 * 
 * @param {bool} isSpecial Describes if this tab is a fake connection or has another (special)
 * purpose.
 */
function disconnect(isSpecial = false) {
	chrome.runtime.sendMessage({
		type: 'disconnect'
	}, function (response) {
		if (!isSpecial) {
			updateStatus(location.href, 'REMOVE', '&ndash;', '&ndash;');
		}
	});
}

/**
 * Navigates on the visited webpage. This means we navigate through it by simulating
 * klicks on links.
 * 
 * @param {number} delay The delay before navigating in milliseconds.
 */
function navigatePage(delay) {
	var links = [];

	$('a').each(function () {
		links.push(this);
	});

	var randomVisit = links[Math.floor(Math.random() * links.length)];
	setTimeout(function () {
		updateStatus(location.href, 'NAVIGATE', '&ndash;', randomVisit.href);
		updateStatistics('clickedLinksCount');
		updateStatistics('visitedSitesCount');

		$(randomVisit)[0].click();
	}, delay);
}

/**
 * Tries to find input fields on the current webpage and simulates a user typing in things in
 * these input fields.
 * 
 * @param {number} delay The delay before searching in milliseconds.
 */
function searchPage(delay) {
	var inputField = $(':input[type=search]').first();
	if (inputField.length == 0) {
		inputField = $(':input[type=text]').first();
	}

	chrome.runtime.sendMessage({
		type: 'getSearchTerm',
		url: new URL(location.href).hostname
	}, function (resp) {
		var form = $(inputField).closest('form');
		var aS = form.attr('action') != undefined ? form.attr('action').includes('search') : false;
		var rS = form.attr('role') != undefined ? form.attr('role').includes('search') : false;

		// Make sure that 1. a search field exists and 2. a search term is available.
		if (inputField.length > 0 && (aS || rS) && resp.searchTerm != ' ') {
			setTimeout(function () {
				$(inputField).val(resp.searchTerm);
				var protocol = location.href.startsWith('https://') ? 'https://' : 'http://';
				updateStatus(
					location.href,
					'SEARCH',
					resp.searchTerm,
					protocol + document.domain + '/search?q=' + encodeURIComponent(resp.searchTerm)
				);
				updateStatistics('keywordSearchCount');
				updateStatistics('visitedSitesCount');

				form.submit();
			}, delay);
		} else {
			updateStatus(location.href, 'SEARCHFAIL', resp.searchTerm, '&ndash;');
			setTimeout(disconnect, delay);
		}
	});
}

/**
 * Updates the statistics (number of visited sites, number of clicked links and so on).
 * 
 * @param {string} property The property which should be updated.
 */
function updateStatistics(property) {
	chrome.runtime.sendMessage({
		type: 'inc' + property.charAt(0).toUpperCase() + property.substring(1)
	}, function (response) {});
}

/**
 * Updates the status table on the working page. For every action performed by this extension,
 * there will be added a new row containing the following information:
 * 
 * @param {string} url The url on which the action was performed.
 * @param {string} type The type of the action.
 * @param {string} searchTerm The term we searched in case the type was 'search'.
 * @param {string} toUrl The url to which we got directed (if we got directed at all).
 */
function updateStatus(url, type, searchTerm, toUrl) {
	chrome.runtime.sendMessage({
		url: url,
		type: type,
		searchTerm: searchTerm,
		toUrl: toUrl
	}, function (response) {});
}

/**
 * Return a weighted random number. The number can have a minimum value, if wanted.
 * 
 * @param {number} weight The number to multiply our random generated number with.
 * @param {number} minVal The minimum number to return, defaults to zero.
 */
function weightedRandom(weight, minVal = 0) {
	var retVal = Math.floor(Math.random() * weight);
	return retVal > minVal ? retVal : minVal;
}

/**
 * Gets the url parameters from the current url.
 */
function getUrlParams() {
	var dummySearchTerm = randomString(16);

	var inputField = $(':input[type=search]').first();
	if (inputField.length == 0) {
		inputField = $(':input[type=text]').first();
	}
	var form = $(inputField).closest('form');
	var aS = form.attr('action') != undefined ? form.attr('action').includes('search') : false;
	var rS = form.attr('role') != undefined ? form.attr('role').includes('search') : false;

	if (inputField.length > 0 && (aS || rS)) {
		chrome.runtime.sendMessage({
			type: data.availableMessageTypes.urlParams,
			dummySearchTerm: dummySearchTerm
		}, function (response) {
			$(inputField).val(dummySearchTerm);
			form.submit();
		});
	} else {
		disconnect(true);
	}
}

/**
 * Generates a random string of a specified length.
 * 
 * @param {number} length The length of the random string.
 */
function randomString(length) {
	var result = '';
	var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	var charactersLength = characters.length;

	for (var i = 0; i < length; i++) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}

	return result;
}