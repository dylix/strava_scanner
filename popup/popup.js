const isPrivilegedContext = typeof browser !== "undefined" && browser.tabs;
function hidePrivilegedButtons() {
	if (!isPrivilegedContext) {
	const buttons = [
		"#scrape-btn",
		"#clear-cache-btn"//,
		//"#open-profile-btn"
	];
	buttons.forEach(selector => {
		const btn = document.querySelector(selector);
		if (btn) {
			btn.style.display = "none";
			// Optional: expressive badge overlay
			const badge = document.createElement("span");
			badge.textContent = btn.textContent + " button disabled here"
			badge.style.cssText = `
			  display: block;
			  margin-top: 4px;
			  font-size: 0.8em;
			  color: #888;
			`;
			btn.parentNode.insertBefore(badge, btn.nextSibling);
		}
	});
	}
}

function getProfileUrls() {
	return Array.from(document.querySelectorAll("#profile-list a")).map(a => a.href).filter(href => href.includes("strava.com/athletes/"));
}

document.getElementById("open-profile-btn").addEventListener("click", () => {
	const urls = getProfileUrls();
	browser.runtime.sendMessage({ action: "openProfiles", urls });
});

document.getElementById("scrape-btn").addEventListener("click", () => {
	document.getElementById("status").textContent = "Sending scrape request...";
	browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
		const isStrava = tab.url.includes("strava.com");
		if (!isStrava) {
			browser.tabs.create({ url: "https://www.strava.com/dashboard" });
			window.close(); // Optional: close popup
		} else {
			browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
				browser.tabs.sendMessage(tabs[0].id, { action: "SCRAPE_FOLLOWERS" });
			});
		}
	});
	document.getElementById("status").textContent = "Finished..";
});

document.getElementById("clear-cache-btn").addEventListener("click", () => {
	document.getElementById("status").textContent = "Clearing cache...";
	browser.runtime.sendMessage({ action: "CLEAN_CACHE" });
	window.close(); // Optional: close popup
});

const port = browser.runtime.connect({ name: "popup" });

function renderProfiles(profiles) {
    const container = document.getElementById("profile-list");
    if (!container) return;

    container.innerHTML = ""; // Clear old content

    // Create and insert header with count
    const header = document.createElement("div");
    header.className = "profile-header";
    header.textContent = `Profiles Found: ${profiles.length}`;
    container.appendChild(header);

    // Append each profile line
    profiles.forEach(({ profile, reason }) => {
        container.appendChild(renderProfileLine(profile, reason));
    });
}


function renderProfileLine(profile, reason) {
	const readableDate = new Date(profile.memberSince).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric"
	});
	const line = document.createElement("div");
	line.innerHTML = `
		<a href="${profile.url}" target="_blank"><strong>${profile.name}</strong></a><br>
		${profile.plocation}<br>
		Member: ${readableDate}<br>
		<em>Reason: ${reason}</em>
		`;
	return line;
}



// Handle port messages
port.onMessage.addListener(renderProfiles);

// Handle initial load
document.addEventListener("DOMContentLoaded", () => {
	browser.runtime.sendMessage({ type: "getProfiles" })
		.then(renderProfiles)
	.catch(err => console.error("Popup failed to load profiles:", err));
});

document.addEventListener("DOMContentLoaded", hidePrivilegedButtons);

window.addEventListener("message", (event) => {
	console.log("we got a message!");
	if (event.data?.type === "profileCacheUpdate") {
		const profileCache = event.data.data;
		// Update the UI with the new cache
		renderProfiles(profileCache);
	}
});

window.addEventListener("message", (event) => {
  if (event.data?.type === "TO_POPUP") {
    const msg = event.data.payload.message;
    document.getElementById("status").textContent = msg;
  }
});
