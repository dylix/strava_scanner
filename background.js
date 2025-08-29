let profileCache = [];
let popupPort = null;

function getOwnAthleteId() {
	const dropdownLink = document.querySelector('.user-menu a[href^="/athletes/"]');
	if (!dropdownLink) return null;
	const match = dropdownLink.href.match(/\/athletes\/(\d+)/);
	return match ? match[1] : null;
}

function cacheAthleteId(id, ttlMinutes = 60) {
	const expiry = Date.now() + ttlMinutes * 60 * 1000;
	localStorage.setItem("dylixstrava_myAthleteId", id);
	localStorage.setItem("dylixstrava_myAthleteIdExpiry", expiry);
}

function getCachedAthleteId() {
	const expiry = parseInt(localStorage.getItem("dylixstrava_myAthleteIdExpiry"), 10);
	if (Date.now() > expiry) return null;
	return localStorage.getItem("dylixstrava_myAthleteId");
}

let athleteId = getCachedAthleteId();
if (!athleteId) {
	athleteId = getOwnAthleteId();
	if (athleteId) cacheAthleteId(athleteId);
}

browser.runtime.onConnect.addListener((port) => {
	if (port.name === "popup") {
		popupPort = port;
		port.onDisconnect.addListener(() => popupPort = null);
	}
});

browser.runtime.onMessage.addListener((message) => {
	if (message.action === "CLEAN_CACHE") {
		profileCache = []
		browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
			browser.tabs.sendMessage(tabs[0].id, { action: "CLEAN_CACHE" });
		});

		}
});

browser.runtime.onMessage.addListener(async (message, sender) => {
	if (message.type === "appendProfile") {
		const { profile, reason } = message.data;
		profileCache.push({ profile, reason });
		notifyPopup();
		return;
	}
	if (message.type === "getProfiles") {
		return profileCache;
	}
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === "openProfiles" && Array.isArray(message.urls)) {
		const MAX_TABS = 10;
		message.urls.slice(0, MAX_TABS).forEach(url => {
			browser.tabs.create({ url });
		});
	}
});

function notifyPopup() {
	// Notify the popup (extension context)
	if (popupPort) {
		popupPort.postMessage(profileCache);
	}

	// Notify the iframe (injected into the page)
	const iframe = document.getElementById("my-extension-iframe");
	if (iframe && iframe.contentWindow) {
		iframe.contentWindow.postMessage(
			{ type: "profileCacheUpdate", data: profileCache },
			"*"
		);
	}
}
