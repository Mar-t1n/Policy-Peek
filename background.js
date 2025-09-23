// Policy Peek - Background Script
// Handles auto-popup functionality when visiting websites

chrome.runtime.onInstalled.addListener(() => {
    console.log('Policy Peek extension installed');
});

// Listen for tab updates (page navigation)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Only proceed when page is completely loaded
    if (changeInfo.status !== 'complete' || !tab.url) {
        return;
    }
    
    // Skip chrome:// and extension:// URLs
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        return;
    }
    
    try {
        // Wait a moment for page to fully load
        setTimeout(async () => {
            await analyzePageForPolicies(tabId, tab);
        }, 2000);
        
    } catch (error) {
        console.error('Error in tab update listener:', error);
    }
});

// Analyze page for privacy policies and terms
async function analyzePageForPolicies(tabId, tab) {
    try {
        // Inject content script to look for policy-related content
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            function: detectPolicyContent
        });
        
        if (results && results[0] && results[0].result) {
            const policyData = results[0].result;
            
            // Check if we found policy-related content
            if (policyData.hasPolicyContent || policyData.hasRiskyKeywords) {
                // Store the analysis data
                await chrome.storage.local.set({
                    [`analysis_${tabId}`]: {
                        url: tab.url,
                        hostname: new URL(tab.url).hostname,
                        policyData: policyData,
                        timestamp: Date.now()
                    }
                });
                
                // Show notification or badge
                await showPolicyAlert(tabId, policyData);
            }
        }
        
    } catch (error) {
        console.error('Error analyzing page for policies:', error);
    }
}

// Content script function to detect policy-related content
function detectPolicyContent() {
    const policyKeywords = [
        'privacy policy', 'terms of service', 'terms and conditions', 
        'cookie policy', 'cookies policy', 'data protection', 'user agreement',
        'privacy notice', 'terms of use', 'legal notice', 'gdpr', 'ccpa',
        'cookie notice', 'cookie consent', 'privacy statement', 'legal terms',
        'acceptable use', 'end user license', 'eula', 'terms & conditions', 'terms', 
        'data policy', 'cookie user', 'cookie settings', 'privacy settings',
        'manage cookies', 'cookie preferences', 'privacy center', 'legal',
        'privacy rights', 'data use policy', 'cookie information', 'cookie details',
        'privacy information', 'cookie banner', 'terms of use policy'
    ];
    
    const riskyKeywords = [
        'sell your data', 'third parties', 'advertising partners',
        'indefinitely', 'without notice', 'at our discretion',
        'no liability', 'as is', 'no warranty'
    ];
    
    const pageText = document.body.innerText.toLowerCase();
    
    let hasPolicyContent = false;
    let hasRiskyKeywords = false;
    let foundPolicyLinks = [];
    let foundRiskyTerms = [];
    
    // Debug: Log some info about the page
    console.log('Policy Peek: Analyzing page:', window.location.hostname);
    console.log('Policy Peek: Found', document.querySelectorAll('a[href]').length, 'links on page');
    
    // Check for policy keywords
    policyKeywords.forEach(keyword => {
        if (pageText.includes(keyword.toLowerCase())) {
            hasPolicyContent = true;
            console.log('Policy Peek: Found policy keyword in page text:', keyword);
        }
    });
    
    // Check for risky keywords
    riskyKeywords.forEach(keyword => {
        if (pageText.includes(keyword.toLowerCase())) {
            hasRiskyKeywords = true;
            foundRiskyTerms.push(keyword);
        }
    });
    
    // Look for policy-related links and add visual indicators
    const links = document.querySelectorAll('a[href]');
    links.forEach(link => {
        const linkText = link.textContent.toLowerCase().trim();
        const href = link.href.toLowerCase();
        
        // Also check aria-label and title attributes
        const ariaLabel = (link.getAttribute('aria-label') || '').toLowerCase();
        const title = (link.getAttribute('title') || '').toLowerCase();
        
        policyKeywords.forEach(keyword => {
            const keywordLower = keyword.toLowerCase();
            
            // Check multiple sources: text content, href, aria-label, and title
            const isMatch = linkText.includes(keywordLower) || 
                           href.includes(keywordLower.replace(/\s+/g, '')) ||
                           href.includes(keywordLower.replace(/\s+/g, '-')) ||
                           href.includes(keywordLower.replace(/\s+/g, '_')) ||
                           ariaLabel.includes(keywordLower) ||
                           title.includes(keywordLower) ||
                           // Also check for partial matches without punctuation
                           linkText.replace(/[^\w\s]/g, '').includes(keywordLower) ||
                           // Check if the link text starts or ends with the keyword
                           linkText.startsWith(keywordLower) ||
                           linkText.endsWith(keywordLower);
            
            if (isMatch) {
                // Avoid duplicate entries
                const alreadyExists = foundPolicyLinks.some(existing => 
                    existing.href === link.href && existing.text === link.textContent.trim()
                );
                
                if (!alreadyExists) {
                    foundPolicyLinks.push({
                        text: link.textContent.trim(),
                        href: link.href
                    });
                    
                    // Add visual indicator next to the link on the webpage, passing the detected keyword
                    addPolicyLinkIndicator(link, keyword);
                }
            }
        });
    });
    
    // Helper function to add caution emoji next to policy links
    function addPolicyLinkIndicator(linkElement, detectedKeyword) {
        // Check if we already added an indicator to avoid duplicates
        if (linkElement.querySelector('.policy-peek-indicator') || 
            linkElement.parentElement.querySelector('.policy-peek-indicator')) {
            return;
        }
        
        // Create the caution emoji indicator
        const indicator = document.createElement('span');
        indicator.className = 'policy-peek-indicator';
        indicator.textContent = '⚠️';
        
        indicator.style.cssText = `
            margin-left: 4px;
            font-size: 14px;
            opacity: 1;
            transition: all 0.3s ease;
            cursor: pointer;
            display: inline;
            text-decoration: none;
        `;
        
        // Add hover effect
        indicator.addEventListener('mouseenter', () => {
            indicator.style.transform = 'scale(1.2)';
            indicator.style.filter = 'brightness(1.2)';
        });
        
        indicator.addEventListener('mouseleave', () => {
            indicator.style.transform = 'scale(1)';
            indicator.style.filter = 'brightness(1)';
        });
        
        // Add click handler to show a tooltip
        indicator.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Create a tooltip
            const tooltip = document.createElement('div');
            tooltip.style.cssText = `
                position: fixed;
                background: #FF9800;
                color: white;
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 12px;
                z-index: 10000;
                pointer-events: none;
                white-space: nowrap;
                box-shadow: 0 4px 12px rgba(255, 152, 0, 0.3);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-weight: 500;
            `;
            // Capitalize the first letter of each word in the detected keyword for display
            const capitalizedKeyword = detectedKeyword.replace(/\b\w/g, l => l.toUpperCase());
            tooltip.textContent = `⚠️ ${capitalizedKeyword} - Review with Policy Peek`;
            
            // Position tooltip near the icon
            const rect = indicator.getBoundingClientRect();
            tooltip.style.left = (rect.right + 8) + 'px';
            tooltip.style.top = (rect.top - 35) + 'px';
            
            // Adjust if tooltip would go off-screen
            if (rect.right + 200 > window.innerWidth) {
                tooltip.style.left = (rect.left - 180) + 'px';
            }
            
            document.body.appendChild(tooltip);
            
            // Remove tooltip after 3 seconds
            setTimeout(() => {
                if (tooltip.parentNode) {
                    tooltip.parentNode.removeChild(tooltip);
                }
            }, 3000);
        });
        
        // Append the indicator directly to the link
        linkElement.appendChild(indicator);
    }
    
    return {
        hasPolicyContent,
        hasRiskyKeywords,
        foundPolicyLinks: foundPolicyLinks.slice(0, 5), // Limit to 5 links
        foundRiskyTerms: foundRiskyTerms.slice(0, 5), // Limit to 5 terms
        hostname: window.location.hostname,
        url: window.location.href
    };
}

// Show policy alert via badge or notification
async function showPolicyAlert(tabId, policyData) {
    try {
        // Set badge text to indicate policy detected
        if (policyData.hasRiskyKeywords) {
            await chrome.action.setBadgeText({ text: '⚠️', tabId: tabId });
            await chrome.action.setBadgeBackgroundColor({ color: '#f44336', tabId: tabId });
        } else if (policyData.hasPolicyContent) {
            await chrome.action.setBadgeText({ text: '📄', tabId: tabId });
            await chrome.action.setBadgeBackgroundColor({ color: '#ff9800', tabId: tabId });
        }
        
        // Auto-open popup for risky content (optional - can be disabled)
        const autoOpenEnabled = await getAutoOpenSetting();
        if (autoOpenEnabled && policyData.hasRiskyKeywords) {
            // Note: Chrome doesn't allow programmatic popup opening
            // Instead, we'll show a notification
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjNjY3ZWVhIiByeD0iNCIvPgo8cGF0aCBkPSJNMTIgMThoMjR2M0gxMnptMCA2aDI0djNIMTJ6bTAgNmgxOHYzSDEyeiIgZmlsbD0id2hpdGUiLz4KPC9zdmc+',
                title: 'Policy Peek Alert',
                message: `Potential privacy risks detected on ${policyData.hostname}. Click the extension icon to analyze.`
            });
        }
        
    } catch (error) {
        console.error('Error showing policy alert:', error);
    }
}

// Get auto-open setting from storage
async function getAutoOpenSetting() {
    try {
        const result = await chrome.storage.local.get(['autoOpenEnabled']);
        return result.autoOpenEnabled !== false; // Default to true
    } catch (error) {
        console.error('Error getting auto-open setting:', error);
        return true;
    }
}

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
    // The popup will handle the display, but we can prepare data
    console.log('Extension icon clicked for tab:', tab.id);
});

// Clean up old analysis data
chrome.tabs.onRemoved.addListener(async (tabId) => {
    try {
        await chrome.storage.local.remove([`analysis_${tabId}`]);
    } catch (error) {
        console.error('Error cleaning up tab data:', error);
    }
});

// Message handler for communication with popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getPageAnalysis') {
        chrome.storage.local.get([`analysis_${request.tabId}`])
            .then(result => {
                sendResponse(result[`analysis_${request.tabId}`] || null);
            })
            .catch(error => {
                console.error('Error getting page analysis:', error);
                sendResponse(null);
            });
        return true; // Indicates async response
    }
    
    if (request.action === 'setAutoOpen') {
        chrome.storage.local.set({ autoOpenEnabled: request.enabled })
            .then(() => sendResponse({ success: true }))
            .catch(error => {
                console.error('Error setting auto-open:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true;
    }
});
