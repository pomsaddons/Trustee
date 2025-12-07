// ==UserScript==
// @name         RoSeal — Copy Profile Link
// @namespace    https://github.com/roseal
// @version      1.2
// @description  Add a copy button to the profile header to copy the Roblox profile URL (uses RoSeal link format).
// @match        https://www.roblox.com/users/*/profile*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Build a canonical profile URL similar to the extension's logic
    function buildUserProfileUrl(userId, isDeleted) {
        return `https://www.roblox.com/${isDeleted ? 'deleted-users' : 'users'}/${userId}/profile`;
    }

    function getMyUserId() {
        // Try meta tag first
        const meta = document.querySelector('meta[name="user-data"]');
        if (meta && meta.dataset && meta.dataset.userid) {
            return meta.dataset.userid;
        }
        // Fallback to global Roblox object if available
        if (window.Roblox && window.Roblox.CurrentUser) {
            return window.Roblox.CurrentUser.userId;
        }
        return null;
    }

    function getCsrfToken() {
        // Roblox stores the CSRF token in a meta tag
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('data-token') : null;
    }

    async function fetchShareLink() {
        try {
            const csrfToken = getCsrfToken();
            if (!csrfToken) {
                console.warn('RoSeal Userscript: No CSRF token found');
                return null;
            }

            const resp = await fetch('https://apis.roblox.com/sharelinks/v1/get-or-create-link', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken
                },
                body: JSON.stringify({
                    linkType: 'Profile'
                })
            });
            
            if (!resp.ok) {
                console.error(`RoSeal Userscript: API error ${resp.status}`);
                return null;
            }
            
            const json = await resp.json();
            return json.shortUrl;
        } catch (e) {
            console.error('RoSeal Userscript: Failed to get share link', e);
            return null;
        }
    }

    function showToast(text) {
        const id = 'roseal-copy-toast';
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            Object.assign(el.style, {
                position: 'fixed',
                right: '16px',
                bottom: '16px',
                background: 'rgba(0,0,0,0.85)',
                color: 'white',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '13px',
                zIndex: 999999,
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
            });
            document.body.appendChild(el);
        }
        el.textContent = text;
        el.style.opacity = '1';
        clearTimeout(el._rosealTimeout);
        el._rosealTimeout = setTimeout(() => {
            el.style.opacity = '0';
        }, 1800);
    }

    function copyTextToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }

        // Fallback for older pages
        return new Promise((resolve, reject) => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                const ok = document.execCommand('copy');
                document.body.removeChild(textarea);
                if (ok) resolve();
                else reject(new Error('copy command failed'));
            } catch (err) {
                document.body.removeChild(textarea);
                reject(err);
            }
        });
    }

    function createSidebarButton(userId, isDeleted) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        // Match Roblox sidebar classes
        a.className = 'dynamic-overflow-container text-nav roseal-copy-profile-sidebar-btn';
        a.href = '#';
        a.style.cursor = 'pointer';

        const divIcon = document.createElement('div');
        const spanIcon = document.createElement('span');
        // We'll use a custom class and inject CSS for the icon
        spanIcon.className = 'roseal-icon-copy';
        divIcon.appendChild(spanIcon);

        const spanText = document.createElement('span');
        spanText.className = 'font-header-2 dynamic-ellipsis-item';
        spanText.textContent = 'Copy Profile Link';

        a.appendChild(divIcon);
        a.appendChild(spanText);
        li.appendChild(a);

        a.addEventListener('click', async (ev) => {
            ev.preventDefault();

            let urlToCopy = buildUserProfileUrl(userId, isDeleted);
            const myId = getMyUserId();

            // If this is the current user, try to get the special share link
            if (userId && myId && String(userId) === String(myId) && !isDeleted) {
                showToast('Generating link...');
                const shareUrl = await fetchShareLink();
                if (shareUrl) {
                    urlToCopy = shareUrl;
                }
            }

            copyTextToClipboard(urlToCopy)
                .then(() => showToast('Profile link copied'))
                .catch(() => showToast('Failed to copy'));
        });

        return li;
    }

    function injectProfileButton() {
        // Check if already injected
        if (document.querySelector('.roseal-copy-profile-sidebar-btn')) return;

        // Find the sidebar list. It usually contains #nav-home or similar items.
        const navHome = document.getElementById('nav-home');
        const sidebarList = navHome ? navHome.closest('ul') : document.querySelector('.left-col-list ul');

        if (sidebarList) {
            // Extract user ID from URL
            const m = location.pathname.match(/\/users\/(\d+)\/profile/);
            if (m) {
                const userId = m[1];
                const isDeleted = false; 
                const btn = createSidebarButton(userId, isDeleted);
                
                // Append as the last li
                sidebarList.appendChild(btn);
            }
        }
    }

    // Initial scan
    injectProfileButton();

    // Observe DOM changes because Roblox is a SPA
    const mo = new MutationObserver((mutations) => {
        injectProfileButton();
    });

    mo.observe(document.body || document.documentElement, { childList: true, subtree: true });

    // Also use an interval for the first few seconds to catch late loads
    const interval = setInterval(() => {
        if (document.querySelector('.roseal-copy-profile-sidebar-btn')) {
            clearInterval(interval);
        } else {
            injectProfileButton();
        }
    }, 500);

    // Stop interval after 10 seconds
    setTimeout(() => clearInterval(interval), 10000);

    // Add CSS for the sidebar icon
    const style = document.createElement('style');
    style.textContent = `
        .roseal-icon-copy {
            display: inline-block;
            width: 28px;
            height: 28px;
            /* Simple copy icon SVG */
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23888'%3E%3Cpath d='M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z'/%3E%3C/svg%3E");
            background-size: 20px;
            background-repeat: no-repeat;
            background-position: center;
            opacity: 0.7;
        }
        /* Dark theme adjustment if needed, though #888 is usually okay for both */
        .dark-theme .roseal-icon-copy {
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23fff'%3E%3Cpath d='M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z'/%3E%3C/svg%3E");
        }
    `;
    document.head.appendChild(style);

})();

