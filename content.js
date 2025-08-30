function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn("Cache read failed:", e);
    return null;
  }
}

browser.runtime.onMessage.addListener((message) => {
  if (message.action === "CLEAN_CACHE") {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith("dylixstrava_")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log(`Removed ${keysToRemove.length} dylixstrava_ items from page localStorage`);
  }
});

function writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn("Cache write failed:", e);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "scrape-overlay";
  overlay.style = `
    position:fixed;top:10px;left:10px;
    background:#222;color:#fff;padding:8px 12px;
    font-family:sans-serif;font-size:14px;
    z-index:9999;border-radius:4px;
  `;
  overlay.textContent = "Starting scrape...";
  document.body.appendChild(overlay);
}

function updateOverlay(text) {
	const overlay = document.getElementById("scrape-overlay");
	if (overlay) overlay.textContent = text;
}

function appendOverlay(text) {
	const overlay = document.getElementById("scrape-overlay");
	if (overlay) {
		const line = document.createElement("div");
		line.textContent = text;
		overlay.appendChild(line);
	}
}

function removeOverlay() {
	const overlay = document.getElementById("scrape-overlay");
	if (overlay) overlay.remove();
}

async function getAllAthleteIds() {
	const match = window.location.pathname.match(/athletes\/(\d+)/);
	const athleteId = match ? match[1] : null;
	if (!athleteId) {
		console.warn("Could not extract athlete ID from URL");
	return [];
	}

	const cacheKey = `dylixstrava_cachedFollowerIds_${athleteId}`;
	const cached = JSON.parse(localStorage.getItem(cacheKey) || "[]");
	if (cached.length > 0) {
		showBadge("Using cached follower IDs");
		return cached;
	}

	let page = 1;
	let allIds = new Set();
	let emptyPages = 0;
	const MAX_EMPTY_PAGES = 2;

	while (true) {
		const url = `https://www.strava.com/athletes/${athleteId}/follows?page=${page}&page_uses_modern_javascript=true&type=followers`;
		showBadge(`📖 Fetching athletes from page: ${page}`);
		const res = await fetch(url);
		const html = await res.text();
		const doc = new DOMParser().parseFromString(html, "text/html");
		const ids = [...doc.querySelectorAll("li[data-athlete-id]")].map(li => li.getAttribute("data-athlete-id"));
		if (ids.length === 0) {
			emptyPages++;
			if (emptyPages >= MAX_EMPTY_PAGES) break;
		} else {
			emptyPages = 0;
			ids.forEach(id => allIds.add(id));
		}
		page++;
		await sleep(1000); // polite delay
	}

	const finalIds = [...allIds];
	localStorage.setItem(cacheKey, JSON.stringify(finalIds));
	showBadge(`Cached ${finalIds.length} follower IDs`);
	return finalIds;
}

function overlayCustomGiftButton() {
	const giftButton = document.querySelector('li.nav-item.upgrade a.btn');
	if (!giftButton) return;

	// Disable original button
	giftButton.style.pointerEvents = "none";
	giftButton.style.opacity = "0.3";
	giftButton.style.display = "none";

	// Create a flex container to hold both buttons
	const btnContainer = document.createElement('div');
	btnContainer.style.position = "relative";
	btnContainer.style.display = "flex";
	btnContainer.style.gap = "8px"; // spacing between buttons
	btnContainer.style.alignItems = "center";

	// Create the first custom button
	const scanBtn = document.createElement('button');
	scanBtn.textContent = "🚴‍♂️ Scan for Bots";
	scanBtn.className = "experiment btn btn-sm btn-warning";
	scanBtn.style.flex = "1";
	scanBtn.style.padding = "8px 12px";
	scanBtn.style.background = "#fc5200";
	scanBtn.style.color = "#fff";
	scanBtn.style.border = "none";
	scanBtn.style.borderRadius = "4px";
	scanBtn.style.cursor = "pointer";
	scanBtn.id = "scanForBotsButton";

	// Create the second button (to the left)
	const followerBtn = document.createElement('button');
	followerBtn.textContent = "👥 New Followers";
	followerBtn.className = "experiment btn btn-sm btn-info";
	followerBtn.style.flex = "1";
	followerBtn.style.padding = "8px 12px";
	followerBtn.style.background = "#007bff";
	followerBtn.style.color = "#fff";
	followerBtn.style.border = "none";
	followerBtn.style.borderRadius = "4px";
	followerBtn.style.cursor = "pointer";
	followerBtn.id = "newFollowersButton";

	// Insert container and buttons
	giftButton.parentElement.style.position = "relative";
	giftButton.parentElement.appendChild(btnContainer);
	btnContainer.appendChild(followerBtn);
	btnContainer.appendChild(scanBtn);

	//followerBtn.onclick = () => {
	//	openAllNewFollowerProfiles();
	//}

	scanBtn.onclick = () => {
		if (shouldRunOnFollowersPage) {
		  const iframe = document.getElementById("my-extension-iframe");
			if (iframe == null) {
				//scrapeFollowers();
				return;
			}
			if (iframe.style.display === "none" || iframe.style.display === "") {
				iframeFollow.style.display = "none";
				iframe.style.display = "block";
				closeBtn.style.display = "block";
				scrapeFollowers(); // Only run when showing the iframe
			} else {
				iframe.style.display = "none"; // Just hide, no scraping
				closeBtn.style.display = "none";
			}
		}
	};
}

function isRecentlyCreated(memberSinceDate) {
	if (!memberSinceDate || !(memberSinceDate instanceof Date)) return false;
	const now = new Date();
	const ageInDays = (now - memberSinceDate) / (1000 * 60 * 60 * 24);
	return ageInDays < 30;
}

function evaluateSuspiciousProfile({ name, plocation, followers, following, clubCount, memberSince, url, profilePic }) {
	const ratio = followers && following ? following / followers : 0;

	const reasons = [];

	if (isLikelyChineseName(name)) reasons.push("Likely Chinese bot");
	if (followers !== null && followers < 5) reasons.push("Low follower count");
	//if (plocation?.toLowerCase().includes("california")) reasons.push("Location match");
	if (ratio > 4) reasons.push(`High follow ratio (${ratio.toFixed(2)})`);
	//if (clubCount > 100) reasons.push(`Too many clubs (${clubCount})`);
	if (isRecentlyCreated(memberSince)) reasons.push("New account (under 30 days)");

	//if (name?.toLowerCase().includes("bot")) reasons.push("Name pattern");
	return { isSuspicious: reasons.length > 0, reasons };
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 * 30; // 30 days

async function fetchProfileDetailsWithCache(url, id) {
	const cached = await getCachedDetails(id);
	if (cached) {
		return { stats: cached, fromCache: true };
	}

	const stats = await fetchProfileDetails(url);
	await setCachedDetails(id, stats);
	return { stats, fromCache: false };
}

function getCachedDetails(athleteId) {
	const key = `dylixstrava_profile_${athleteId}`;
	const raw = localStorage.getItem(key);
	if (!raw) return null;

	try {
		const entry = JSON.parse(raw);
		if (!entry.timestamp) return null;

		const isFresh = Date.now() - entry.timestamp < CACHE_TTL_MS;
		if (isFresh) {
			showBadge(`✅ Cached: ${athleteId}`, "green");
			return entry.data;
		} else {
			showBadge(`⚠️ Stale cache: ${athleteId}`, "orange");
			return null;
		}
	} catch (e) {
		console.warn(`Failed to parse cache for ${athleteId}`, e);
		return null;
	}
}

function setCachedDetails(athleteId, data) {
	const key = `dylixstrava_profile_${athleteId}`;
	const entry = {
		data,
		timestamp: Date.now()
	};
	try {
		localStorage.setItem(key, JSON.stringify(entry));
		showBadge(`📦 Cached new: ${athleteId}`, "blue");
	} catch (e) {
		console.error(`Failed to cache data for ${athleteId}`, e);
	}
}

async function fetchProfileDetails(url) {
	try {
		const res = await fetch(url);
		  const finalUrl = res.url;
		  if (finalUrl.includes('/athletes/search')) {
			throw new Error("Profile doesnt exist"); 
		  }
		const html = await res.text();
		const doc = new DOMParser().parseFromString(html, "text/html");
		// Followers & Following
		const statsBlock = doc.querySelector("ul.inline-stats");
		const items = statsBlock ? [...statsBlock.querySelectorAll("li")] : [];

		let followers = null, following = null;
		items.forEach(li => {
			const label = li.textContent.toLowerCase();
			const match = label.match(/\d+/);
			if (label.includes("followers") && match) followers = parseInt(match[0]);
			if (label.includes("following") && match) following = parseInt(match[0]);
		});

		// Name
		const nameEl = doc.querySelector("h1.athlete-name");
		const name = nameEl?.textContent.replace(/\s{2,}/g, ' ').trim()  || null;
		const firstName = name?.split(' ')[0] || null;
		
		let memberSince = null;
		const titleAttr = nameEl?.getAttribute("title");
		const match = titleAttr?.match(/Member Since:\s*(.+)/);
		if (match) {
			memberSince = new Date(match[1]);
		}
		// Location
		const locationEl = doc.querySelector("div.location");
		const plocation = locationEl?.textContent.trim() || null;

		// Block Button Detection
		const blockBtn = doc.querySelector("button.block");
		const canBlock = !!blockBtn;
		const blockLabel = blockBtn?.textContent.trim() || null;

		const clubCount = doc.querySelectorAll('ul.clubs > li').length;
		//const profilePic = getAvatarByAthleteId(doc, extractIdFromUrl(url)) || null;
		const { profilePic, isPremium } = getAvatarByAthleteId(doc, extractIdFromUrl(url));
		
		return {
			name,
			plocation,
			followers,
			following,
			canBlock,
			clubCount,
			memberSince,
			url,
			profilePic,
			isPremium
		};

	} catch (err) {
		console.warn("Failed to fetch profile details for", url, err);
		return {
			name: null,
			plocation: null,
			followers: null,
			following: null,
			canBlock: false,
			memberSince: null,
			url: null,
			profilePic: null,
			isPremium: false
		};
	}
}

function getAvatarByAthleteId(doc, athleteId) {
  const wrappers = doc.querySelectorAll('[data-react-class="AvatarWrapper"]');

  for (const wrapper of wrappers) {
    const rawProps = wrapper.getAttribute('data-react-props');
    if (!rawProps) continue;

    try {
      const props = JSON.parse(rawProps.replace(/&quot;/g, '"'));

      // ✅ Premium: Match by athlete ID embedded in the image URL
      if (props.src && props.src.includes(`athletes/${athleteId}/`)) {
        return { profilePic: props.src, isPremium: true };
      }
    } catch (err) {
      console.warn("Failed to parse AvatarWrapper props:", err);
    }

    // 🔄 Fallback: Try to extract <img> directly from the wrapper
    const img = wrapper.querySelector('img');
    if (img && img.src) {
      return { profilePic: img.src, isPremium: false };
    }
  }

  // 🧯 Private profile fallback
  const privateAvatar = doc.querySelector('.avatar-img-wrapper img')?.src;
  if (privateAvatar) {
    return { profilePic: privateAvatar, isPremium: false };
  }

  // 🧠 Final fallback: og:image meta tag
  const ogimage = doc.querySelector('meta[property="og:image"]')?.content;
  if (ogimage) {
    return { profilePic: ogimage, isPremium: false };
  }

  console.warn(`❌ No avatar found for athlete ${athleteId}`);
  return { profilePic: null, isPremium: false };
}

function sendProfileToBackground(profile, reason) {
	browser.runtime.sendMessage({
		type: "appendProfile",
		data: {
			profile,
			reason
		}
	});
}

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

function shouldRunOnFollowersPage() {
	const params = new URLSearchParams(window.location.search);
	const isFollowers = params.get("type") === "followers";
	const hasPage = params.has("page");

	return isFollowers && !hasPage;
}

async function scrapeFollowers() {
	
	/*if (!window.location.href.includes("type=followers")) {
		alert("Please navigate to your Followers page to run this extension.");
		return;
	}*/
	if (!window.location.href.includes("type=followers")) {
		window.location.href = `/athletes/${athleteId}/follows?type=followers`;
		return;
	}
	createOverlay();
	updateOverlay("Fetching athlete IDs...");

	const athleteIds = await getAllAthleteIds();
	updateOverlay(`Found ${athleteIds.length} athletes`);

	const results = [];
	for (const [i, id] of athleteIds.entries()) {
		const url = `https://www.strava.com/athletes/${id}`;
		updateOverlay(`Scraping ${i + 1}/${athleteIds.length}`);
		const { stats, fromCache } = await fetchProfileDetailsWithCache(url, id);
		const { isSuspicious, reasons } = evaluateSuspiciousProfile(stats);
		//console.log(isSuspicious, reasons, stats);
		if (isSuspicious) {
			sendProfileToBackground(stats, reasons);
		}
		results.push({ url, ...stats });
		if (!fromCache) {
			await sleep(500); // Only rate-limit if we hit the server
		}
	}
	removeOverlay();
}

function clickFinalBlockButton() {
	const confirmBtn = document.querySelector("a.confirm-block");
	if (confirmBtn) {
		confirmBtn.click();
		//console.log("✅ Final block confirmed.");
		showBadge("Final Block Confirmed 🚫", "#d00");
	} else {
		showBadge("⚠️ Confirmation dialog not found.");
	}
}

function showBadge(text, bgColor = "#333") {
	const badge = document.createElement("div");
	badge.textContent = text;
	badge.style.cssText = `
	position:fixed;top:10px;right:10px;
	background:${bgColor};color:white;
	padding:6px 12px;border-radius:4px;
	font-weight:bold;z-index:9999;
	`;
	document.body.appendChild(badge);
	setTimeout(() => badge.remove(), 3000);
}

function isLikelyChineseName(name) {
	if (!name) return false;
	// Check for Chinese characters
	const hasChineseChars = /[\u4e00-\u9fff]/.test(name);

	// Check for common surnames
	const commonSurnames = ["Li", "Wang", "Zhao", "Chen", "Zhang", "Liu", "Yang", "Huang", "Xu", "Wu", "Sun", "Gao", "Lin", "Guo", "Deng", "Xinyan"];
	const nameParts = name.split(" ");

	const surnameMatch = nameParts.some(part => commonSurnames.includes(part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()));
	// Check for pinyin-like structure (2–3 syllables, capitalized)
	const isPinyinStyle = nameParts.length <= 3 && nameParts.every(part => /^[A-Z][a-z]+$/.test(part));

	return hasChineseChars || (surnameMatch && isPinyinStyle);
}

function showSuspiciousProfileOverlay({ name, plocation, followers, following, readableDate, reasons }, onDecision) {
	const overlay = document.createElement("div");
	overlay.style.cssText = `
		position: fixed; top: 0; left: 0; width: 100%; height: 100%;
		background: rgba(0,0,0,0.8); z-index: 9999; display: flex;
		align-items: center; justify-content: center; font-family: sans-serif;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		text-rendering: optimizeLegibility;
		image-rendering: auto;
		-webkit-font-smoothing: antialiased;
	`;

	const modal = document.createElement("div");
	modal.style.cssText = `
		background: #fff; padding: 24px; border-radius: 8px; max-width: 500px;
		box-shadow: 0 0 20px rgba(0,0,0,0.3); text-align: left;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		text-rendering: optimizeLegibility;
		image-rendering: auto;
		-webkit-font-smoothing: antialiased;
	`;

	modal.innerHTML = `
		<h2 style="margin: 0 0 12px 0;">🚨 Suspicious Profile Detected 🚨</h2>
		<p style="margin: 4px 0;"><strong>Name:</strong> ${name}</p>
		${plocation ? `<p style="margin: 4px 0;"><strong>Location:</strong> ${plocation}</p>` : ""}
		<p style="margin: 4px 0;"><strong>Followers:</strong> ${followers}</p>
		<p style="margin: 4px 0;"><strong>Following:</strong> ${following}</p>
		<p style="margin: 4px 0;"><strong>Member Since:</strong> ${readableDate}</p>
		<p style="margin: 8px 0 4px;"><strong>Reasons:</strong></p>
		<ul style="margin: 0; padding-left: 20px;">
			${reasons.map(reason => `<li style="margin-bottom: 4px;">${reason}</li>`).join("")}
		</ul>
		<div style="margin-top: 16px; text-align: right;">
			<button id="blockBtn" style="margin-right: 10px; padding: 8px 16px; background: #d33; color: white; border: none; border-radius: 4px;">Block</button>
			<button id="ignoreBtn" style="padding: 8px 16px; background: #ccc; border: none; border-radius: 4px;">Ignore</button>
		</div>

	`;

	overlay.appendChild(modal);
	document.body.appendChild(overlay);

	overlay.querySelector("#blockBtn").onclick = () => {
		document.body.removeChild(overlay);
		onDecision(true);
	};
	overlay.querySelector("#ignoreBtn").onclick = () => {
		document.body.removeChild(overlay);
		onDecision(false);
	};
}

function confirmAndBlockSuspiciousProfile() {
	const name = document.querySelector("h1.athlete-name")?.textContent.replace(/\s{2,}/g, ' ').trim()  || "";
	const plocation = document.querySelector("div.location")?.textContent.trim() || "";
	const statsItems = [...document.querySelectorAll("ul.inline-stats li")];

	let followers = null, following = null;
	statsItems.forEach(li => {
	const label = li.textContent.toLowerCase();
	const match = label.match(/\d+/);
	if (label.includes("followers") && match) followers = parseInt(match[0]);
	if (label.includes("following") && match) following = parseInt(match[0]);
	});

	const blockBtn = document.querySelector("button.block");
	const nameEl = document.querySelector("h1.athlete-name");
	let memberSince = null;
	const titleAttr = nameEl?.getAttribute("title");
	const match = titleAttr?.match(/Member Since:\s*(.+)/);
	if (match) {
		memberSince = new Date(match[1]);
	}
	const readableDate = new Date(memberSince).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric"
	});
	const clubList = document.querySelectorAll('ul.clubs > li');
	const clubCount = clubList.length;
	const profile = { name, plocation, followers, following, clubCount, memberSince };
	const { isSuspicious, reasons } = evaluateSuspiciousProfile(profile);

	if (isSuspicious && blockBtn) {
		//const message = `🚨 Suspicious profile detected:\n\nName: ${name}\nLocation: ${plocation}\nFollowers: ${followers}\nFollowing: ${following}\nMember Since: ${readableDate}\nReasons: ${reasons.join(", ")}\n\nDo you want to block this profile?`;
		//const shouldBlock = confirm(message);

		showSuspiciousProfileOverlay({
		  name,
		  location: plocation,
		  followers,
		  following,
		  readableDate,
		  reasons
		}, (shouldBlock) => {
			if (shouldBlock) {
			blockBtn.click();
				setTimeout(clickFinalBlockButton, 500); // Wait for dialog to render
				//console.log(`✅ Blocked: ${name} (${plocation})`);
				const badge = document.createElement("div");
				badge.textContent = "Profile Blocked 🚫";
				badge.style.cssText = "position:fixed;top:10px;right:10px;background:red;color:white;padding:5px;z-index:9999;";
				document.body.appendChild(badge);
				setTimeout(() => badge.remove(), 3000);
			} else {
			// ignore logic here
			}
		});
	} else {
	//console.log(`✅ Profile passed: ${name}`);
	}
};

function openNotificationsPanel() {
  const bellButton = document.querySelector('button[data-cy="notifications-bell"]');
  if (bellButton && bellButton.getAttribute("aria-expanded") === "false") {
    bellButton.click();
  }
}

function waitForNotificationsList(callback, maxWait = 8000, stableFor = 500) {
  const start = Date.now();
  let lastCount = 0;
  let stableStart = null;

  (function poll() {
    const list = document.querySelector("#notifications-list");
    const items = list?.querySelectorAll("li") ?? [];

    if (items.length > 0) {
      if (items.length === lastCount) {
        if (!stableStart) stableStart = Date.now();
        if (Date.now() - stableStart >= stableFor) {
          callback(items);
          return;
        }
      } else {
        lastCount = items.length;
        stableStart = null;
      }
    }

    if (Date.now() - start < maxWait) {
      setTimeout(poll, 100);
    } else {
      alert("⚠️ Notifications list did not load in time.");
    }
  })();
}

function extractIdFromUrl(url) {
  const match = url.match(/\/athletes\/(\d+)/);
  return match ? match[1] : null;
}

async function renderFollowerPageInIframe(urls) {
  let htmlParts = [];

  htmlParts.push(`
  <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: sans-serif; padding: 10px; background-color: white; }
          .athlete { margin-bottom: 20px; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
          .cached { color: green; }
          .live { color: blue; }
          .summary { margin-bottom: 20px; font-size: 16px; }
.cycling-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid #f44336; /* red rim like a racing tire */
  box-shadow: 0 0 8px rgba(0,0,0,0.2);
  background: radial-gradient(circle at center, #fff 40%, #f44336 100%);
  display: inline-block;
  margin: 5px;
  position: relative;
}

.cycling-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.badge {
  position: absolute;
  bottom: -5px;
  right: -5px;
  background: #fff;
  border: 2px solid #f44336;
  border-radius: 50%;
  padding: 4px;
  font-size: 14px;
  box-shadow: 0 0 4px rgba(0,0,0,0.2);
}
.cycling-avatar.premium {
  border-color: red;
}
.cycling-avatar.standard {
  border-color: gray;
}
        </style>
      </head>
      <body>
        <h4 style="margin: 0 0 12px 0;">🚨 Suspicious New Followers 🚨</h4>
  `);

  let suspiciousCount = 0;
  let skippedCount = 0;
  let safeProfiles = [];

  const fetchPromises = urls.map(async (url) => {
    const id = extractIdFromUrl(url);
    if (!id) return `<div class="athlete">❌ Invalid URL: ${url}</div>`;

    try {
      const { stats, fromCache } = await fetchProfileDetailsWithCache(url, id);
      const { isSuspicious, reasons } = evaluateSuspiciousProfile(stats);
      const statusClass = fromCache ? "cached" : "live";
      const statusLabel = fromCache ? "🟢 Cached" : "🆕 Live";
      const readableDate = new Date(stats.memberSince).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
      });

const profileHtml = `
  <div class="athlete" style="margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #ccc;">
    <h2 style="margin: 4px 0;">Name: ${stats.name}</h2>

    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 8px;">
      <div class="cycling-avatar ${stats.isPremium ? 'premium' : 'standard'}" style="position: relative;">
        <img src="${stats.profilePic}" alt="Cyclist Avatar" style="width: 80px; height: 80px; border-radius: 50%;"/>
        <!--<div class="badge" style="position: absolute; bottom: -6px; right: -6px; font-size: 20px;">🚴‍♀️</div>-->
      </div>

      <div style="flex-grow: 1;">
        <a href="https://www.strava.com/athletes/${id}" target="_blank">
          <button id="profileBtn" style="cursor: pointer; padding: 8px 16px; background: #d33; color: white; border: none; border-radius: 4px;">
            View Profile
          </button>
        </a>
		<p class="${statusClass}" style="margin: 0 0 6px;">${statusLabel}</p>
      </div>
    </div>

    <p style="margin: 2px 0;"><strong>Athlete ID:</strong> ${id}</p>
    ${stats.plocation ? `<p style="margin: 2px 0;"><strong>Location:</strong> ${stats.plocation}</p>` : ""}
    <p style="margin: 2px 0;"><strong>Followers:</strong> ${stats.followers}</p>
    <p style="margin: 2px 0;"><strong>Following:</strong> ${stats.following}</p>
    <p style="margin: 2px 0;"><strong>Member Since:</strong> ${readableDate}</p>

    ${isSuspicious ? `
      <p style="margin: 6px 0 2px;"><strong>Reasons:</strong></p>
      <ul style="margin: 0; padding-left: 18px;">
        ${reasons.map(reason => `<li style="margin-bottom: 2px;">${reason}</li>`).join("")}
      </ul>
    ` : ""}
  </div>
`;



      if (isSuspicious) {
        suspiciousCount++;
        return profileHtml;
      } else {
        skippedCount++;
        safeProfiles.push(profileHtml);
        return ""; // skip from main section
      }
    } catch (err) {
      return `<div class="athlete">❌ Error fetching ${id}: ${err.message}</div>`;
    }
  });

  const results = await Promise.all(fetchPromises);
  const filteredResults = results.filter(html => html.trim() !== "");

  // Add summary message
  htmlParts.push(`
    <div class="summary">
      🔍 Found ${suspiciousCount} suspicious profile${suspiciousCount !== 1 ? "s" : ""} out of ${urls.length} scanned.
      ✅ ${skippedCount} clean profile${skippedCount !== 1 ? "s" : ""} added to Safe Followers. 🚴‍♂️
    </div>
  `);

  htmlParts.push(...filteredResults);

  if (safeProfiles.length > 0) {
    htmlParts.push(`<h4 style="margin-top: 32px;">✅ Safe Followers ✅</h4>`);
    htmlParts.push(...safeProfiles);
  }

  htmlParts.push(`
      </body>
    </html>
  `);

  const html = htmlParts.join("\n");
  const blob = new Blob([html], { type: "text/html" });
  const pageUrl = URL.createObjectURL(blob);

  const iframe = document.querySelector("#my-extension-iframe-follow");
  if (iframe) {
    iframe.src = pageUrl;
  } else {
    console.warn("❌ iframe not found.");
  }
}


function openAllNewFollowerProfiles() {
	if (iframeFollow.style.display === "none" || iframeFollow.style.display === "") {
		iframe.style.display = "none";
		iframeFollow.style.display = "block";
		closeBtn.style.display = "block";
	} else {
		iframeFollow.style.display = "none"; // Just hide, no scraping
		closeBtn.style.display = "none";
		return;
	}
	
	openNotificationsPanel();
	waitForNotificationsList((items) => {
		const urls = [];
		items.forEach((li) => {
			const text = li.textContent.toLowerCase();
			if (text.includes("new follower")) {
				const link = li.querySelector("a");
				if (link?.href) {
					urls.push(link.href);
				}
			}
		});
		renderFollowerPageInIframe(urls);
		const bellButton = document.querySelector('button[data-cy="notifications-bell"]');
		if (bellButton && bellButton.getAttribute("aria-expanded") === "true") {
			bellButton.click();
		}
	});
}

const path = window.location.pathname;

// Match only `/athletes/{id}` — no trailing segments
const isProfilePage = /^\/athletes\/\d+$/.test(path);
if (isProfilePage) {
	//document.body.insertAdjacentHTML('beforeend', '<div style="position:fixed;top:0;left:0;background:#0f0;color:#000;padding:5px;z-index:9999;">Profile script active</div>');
	showBadge("Profile script active");
	confirmAndBlockSuspiciousProfile(); // or whatever function you want to trigger
}

if (window.location.href.includes("strava.com")) {
	//injectScrapeFollowersButton();
	overlayCustomGiftButton();
}

browser.runtime.onMessage.addListener((msg) => {
	if (msg.action === "SCRAPE_FOLLOWERS") {
		scrapeFollowers();
	}
});

browser.runtime.onMessage.addListener((msg) => {
	if (msg.action === "CLEAN_CACHE") {
		showBadge("Cleaning cache..");
		//localStorage.removeItem("strava_athlete_ids");
	}
});

// Inject your popup-like UI into the page
const iframe = document.createElement("iframe");
iframe.src = browser.runtime.getURL("popup/popup.html");
iframe.style.position = "fixed";
iframe.style.top = "70px";
iframe.style.right = "15px";
iframe.style.width = "400px";
iframe.style.height = "600px";
iframe.style.zIndex = "9999";
iframe.style.display = "none";
iframe.id = "my-extension-iframe";

const iframeFollow = document.createElement("iframe");
//iframeFollow.src = browser.runtime.getURL("popup/popup.html");
iframeFollow.src = browser.runtime.getURL("popup/loading.html");
iframeFollow.style.position = "fixed";
iframeFollow.style.top = "70px";
iframeFollow.style.right = "15px";
iframeFollow.style.width = "400px";
iframeFollow.style.height = "600px";
iframeFollow.style.zIndex = "9999";
iframeFollow.style.display = "none";
iframeFollow.id = "my-extension-iframe-follow";

// Create close button
const closeBtn = document.createElement("button");
closeBtn.textContent = "✖";
closeBtn.style.position = "fixed";
closeBtn.style.top = "75px"; // slightly above iframe
closeBtn.style.right = "30px";
closeBtn.style.zIndex = "10000"; // above iframe
closeBtn.style.background = "#d33";
closeBtn.style.color = "white";
closeBtn.style.border = "none";
closeBtn.style.borderRadius = "4px";
closeBtn.style.padding = "4px 8px";
closeBtn.style.cursor = "pointer";
closeBtn.style.display = "none"; // initially hidden
closeBtn.id = "my-extension-close-btn";

document.body.appendChild(closeBtn);
document.body.appendChild(iframe);
document.body.appendChild(iframeFollow);

// Hide both on click
closeBtn.addEventListener("click", () => {
  iframe.style.display = "none";
  iframeFollow.style.display = "none";
  closeBtn.style.display = "none";
});

if (shouldRunOnFollowersPage()) {
	iframeFollow.style.display = "none";
	iframe.style.display = "block";
	closeBtn.style.display = "block";
	scrapeFollowers();
}

function waitForTriggerButton(retries = 20) {
  const trigger = document.querySelector("#newFollowersButton");
  if (trigger) {
    trigger.addEventListener("click", openAllNewFollowerProfiles);
    //console.log("✅ Bound click handler to trigger button.");
  } else if (retries > 0) {
    setTimeout(() => waitForTriggerButton(retries - 1), 250);
  } else {
    console.warn("❌ Trigger button not found after retries.");
  }
}

waitForTriggerButton();