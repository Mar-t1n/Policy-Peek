// Policy Peek - Popup Script (with additional inline comments)
//
// This file controls the popup UI and the analysis logic for the extension.
// Comments were added to explain intent and flow at more places.

document.addEventListener('DOMContentLoaded', function() {
    console.log('Policy Peek: DOM loaded, initializing extension...');
    
    // Grab frequently used DOM elements once on load for performance and clarity.
    const riskIndicator = document.getElementById('riskIndicator'); // container for risk UI
    const riskBadge = document.getElementById('riskBadge'); // small visual badge (if present)
    const riskLevel = document.getElementById('riskLevel'); // textual level (Safe / Risky / Analyzing)
    const riskDescription = document.getElementById('riskDescription'); // human-friendly summary line
    const policyText = document.getElementById('policyText'); // textarea for manual policy input
    const analyzeButton = document.getElementById('analyzeButton'); // button to trigger manual analysis
    const results = document.getElementById('results'); // results container that is shown/hidden
    const summary = document.getElementById('summary'); // summary output element
    const keyPoints = document.getElementById('keyPoints'); // list of found risks / positives
    
    // Verify DOM elements exist
    if (!riskLevel || !riskDescription) {
        console.error('Critical DOM elements missing:', { riskLevel: !!riskLevel, riskDescription: !!riskDescription });
    }

    // Configuration and AI initialization function handles
    // We try to read these from a global provided by the background or initializer,
    // otherwise we fall back to safe defaults so the popup still works.
    let CONFIG, initializeAIAPIs, checkAIAvailability;
    
    try {
        console.log('Policy Peek: Loading configuration...');
        // window.PolicyPeekConfig is expected to be provided by the extension background or loader.
        if (window.PolicyPeekConfig) {
            console.log('Policy Peek: PolicyPeekConfig found, loading...');
            // Destructure expected fields. If missing, the catch below will supply defaults.
            ({ CONFIG, initializeAIAPIs, checkAIAvailability } = window.PolicyPeekConfig);
            console.log('Policy Peek: Configuration loaded successfully');
        } else {
            // Warn and set fallback configuration to keep the UI usable without external AI.
            console.warn('Policy Peek: PolicyPeekConfig not available, using fallback configuration');
            CONFIG = {
                ENABLE_EXTERNAL_AI: false,
                ENABLE_HISTORY_CHECKER: true,
                ENABLE_TRANSLATION: true
            };
            // Minimal no-op implementations so later calls are safe.
            initializeAIAPIs = () => console.log('AI APIs initialization skipped - config not available');
            checkAIAvailability = async () => ({
                summarizer: false,
                writer: false,
                rewriter: false,
                translator: false,
                proofreader: false
            });
        }
    } catch (error) {
        // If accessing the config throws for any reason, log and fallback.
        console.error('Policy Peek: Error loading configuration:', error);
        CONFIG = {
            ENABLE_EXTERNAL_AI: false,
            ENABLE_HISTORY_CHECKER: true,
            ENABLE_TRANSLATION: true
        };
        initializeAIAPIs = () => {};
        checkAIAvailability = async () => ({
            summarizer: false,
            writer: false,
            rewriter: false,
            translator: false,
            proofreader: false
        });
    }
    
    // Immediately initialize behavior (UI status, AI checks, auto-analysis).
    // Wrap in try-catch to ensure the extension always loads
    try {
        init();
    } catch (criticalError) {
        console.error('Critical initialization error:', criticalError);
        // Provide basic functionality even if initialization completely fails
        updateRiskIndicator('safe', 'Extension loaded in safe mode. Manual analysis available below.');
    }

    async function init() {
        try {
            // Initialize tokens or any required setup for browser-provided AI APIs.
            // This call may be a no-op when using the fallback implementation above.
            if (typeof initializeAIAPIs === 'function') {
                initializeAIAPIs();
            }
            
            // Query which AI capabilities are available and display a small status indicator.
            let aiAvailability = {};
            if (typeof checkAIAvailability === 'function') {
                aiAvailability = await checkAIAvailability();
            } else {
                aiAvailability = {
                    summarizer: false,
                    writer: false,
                    rewriter: false,
                    translator: false,
                    proofreader: false
                };
            }
            console.log('AI APIs availability:', aiAvailability);
            
            // Render a compact status indicator in the popup to inform the user.
            displayAIStatus(aiAvailability);
            
            // Attempt to analyze the current active tab automatically so the user sees something immediately.
            // This works regardless of AI availability because the analysis has local fallbacks.
            await analyzeCurrentPage();
        } catch (error) {
            // Any initialization error is logged but shouldn't block the user.
            console.error('Initialization error:', error);
            
            // Show a safe default status instead of throwing errors
            updateRiskIndicator('safe', 'Extension loaded successfully. Use manual analysis below to check privacy policies.');
            
            // Try to show basic AI status
            try {
                displayAIStatus({
                    summarizer: false,
                    writer: false,
                    rewriter: false,
                    translator: false,
                    proofreader: false
                });
            } catch (statusError) {
                console.warn('Could not display AI status:', statusError);
            }
        }
    }

    function displayAIStatus(aiAvailability) {
        try {
            // Find the main container in the popup to attach a tiny status badge.
            const container = document.querySelector('.container');
            if (!container) {
                console.warn('Container element not found for AI status display');
                return;
            }
            
            // Build a visually small status indicator. Inline style used since popup CSS is minimal.
            const statusDiv = document.createElement('div');
            statusDiv.style.cssText = `
                position: absolute;
                top: 5px;
                right: 5px;
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 10px;
                background: rgba(255,255,255,0.1);
                color: rgba(255,255,255,0.7);
            `;
            
            // Count available vs total APIs to show a concise ratio.
            const availableAPIs = Object.entries(aiAvailability || {}).filter(([_, available]) => available).length;
            const totalAPIs = Object.keys(aiAvailability || {}).length;
            
            // Different color to quickly indicate fallback vs partial availability.
            if (availableAPIs > 0) {
                statusDiv.textContent = `AI: ${availableAPIs}/${totalAPIs}`;
                statusDiv.style.background = 'rgba(76,175,80,0.3)'; // greenish when some AI is available
            } else {
                statusDiv.textContent = 'AI: Fallback Mode';
                statusDiv.style.background = 'rgba(255,152,0,0.3)'; // amber when using fallback
            }
            
            container.appendChild(statusDiv);
        } catch (error) {
            // UI display errors should not break core functionality.
            console.error('Error displaying AI status:', error);
        }
    }

    async function analyzeCurrentPage() {
        try {
            // Show immediate analyzing state in the UI so user knows work is in progress.
            updateRiskIndicator('analyzing', 'Analyzing current website...');

            // Get active tab (only one expected) from Chrome's tabs API.
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                // No active tab (rare), update UI accordingly and stop.
                updateRiskIndicator('safe', 'No active tab found');
                return;
            }

            // First, try to use pre-computed detection results from the background script
            // (this is faster if the background script already analyzed the page).
            try {
                const response = await chrome.runtime.sendMessage({
                    action: 'getPageAnalysis',
                    tabId: tab.id
                });

                if (response && response.policyData) {
                    // If the background provided analysis, display that (no injection required).
                    displayAutoDetectedAnalysis(response);
                } else {
                    // Otherwise perform in-page analysis directly (content script injection).
                    await performRealTimeAnalysis(tab);
                }
            } catch (messageError) {
                // If message to background fails (permissions, runtime error), fallback to direct in-page analysis.
                console.warn('Background script communication failed, running direct analysis:', messageError);
                await performRealTimeAnalysis(tab);
            }

        } catch (error) {
            // Any unexpected error during page analysis is logged and the UI shows a failure state.
            console.error('Page analysis error:', error);
            updateRiskIndicator('risky', 'Could not analyze current page');
        }
    }

    function displayAutoDetectedAnalysis(analysisData) {
        // analysisData is expected to contain policyData and the hostname it applies to.
        const { policyData, hostname } = analysisData;
        
        // Default to 'safe' with a neutral description; update below if risks found.
        let level = 'safe';
        let description = `${hostname} appears to have standard privacy practices.`;
        
        // If background detection flagged risky keywords, elevate to risky and include terms found.
        if (policyData.hasRiskyKeywords) {
            level = 'risky';
            description = `Potential privacy risks detected on ${hostname}. Found: ${policyData.foundRiskyTerms.join(', ')}`;
        } else if (policyData.hasPolicyContent) {
            // If policy links were found but no risky keywords, indicate policy presence.
            level = 'safe';
            description = `Privacy policy detected on ${hostname}. ${policyData.foundPolicyLinks.length} policy links found.`;
        }
        
        // Update the compact risk indicator UI.
        updateRiskIndicator(level, description);
        
        // If the background found policy links, render them in the popup for quick access.
        if (policyData.foundPolicyLinks.length > 0) {
            displayPolicyLinks(policyData.foundPolicyLinks);
        }
    }

    function displayPolicyLinks(policyLinks) {
        // Build a small list of links with styling that fits the popup theme.
        const linksHTML = policyLinks.map(link => 
            `<li><a href="${link.href}" target="_blank" style="color: rgba(255,255,255,0.8); text-decoration: none;">${link.text}</a></li>`
        ).join('');
        
        const policyLinksDiv = document.createElement('div');
        // Inline HTML snippet to keep popup markup simple and self-contained.
        policyLinksDiv.innerHTML = `
            <div style="margin-top: 10px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 8px;">
                <h4 style="margin: 0 0 8px 0; font-size: 12px; color: rgba(255,255,255,0.9);">Found Policy Links:</h4>
                <ul style="margin: 0; padding-left: 15px; font-size: 11px;">${linksHTML}</ul>
            </div>
        `;
        
        // Attach to the main risk indicator area so it is visible with the result summary.
        riskIndicator.appendChild(policyLinksDiv);
    }

    async function performRealTimeAnalysis(tab) {
        try {
            // Inject a small script into the active tab to collect plaintext and detect keywords.
            // Using chrome.scripting.executeScript to run inside the page context (safer than eval).
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: () => {
                    // This function runs in the context of the web page (not in the popup).
                    // Extract visible textual content and normalize to lowercase for keyword checks.
                    const pageText = document.body.innerText.toLowerCase();
                    // Keywords used to detect policy presence and risky terms.
                    const policyKeywords = ['privacy policy', 'terms of service', 'cookie policy'];
                    const riskyKeywords = ['sell your data', 'third parties', 'without notice'];
                    
                    let hasPolicyContent = false;
                    let hasRiskyKeywords = false;
                    
                    // Simple containment checks; fine for heuristic detection in the popup.
                    policyKeywords.forEach(keyword => {
                        if (pageText.includes(keyword)) hasPolicyContent = true;
                    });
                    
                    riskyKeywords.forEach(keyword => {
                        if (pageText.includes(keyword)) hasRiskyKeywords = true;
                    });
                    
                    // Return a compact object with the analysis result to the popup.
                    return { hasPolicyContent, hasRiskyKeywords, hostname: window.location.hostname };
                }
            });
            
            // The results array mirrors the scripting API's responses; take first frame's result.
            if (results && results[0]) {
                const analysis = results[0].result;
                let level = 'safe';
                let description = `${analysis.hostname} appears to have standard privacy practices.`;
                
                // Elevate to risky if risky keywords were found.
                if (analysis.hasRiskyKeywords) {
                    level = 'risky';
                    description = `Potential privacy risks detected on ${analysis.hostname}`;
                } else if (analysis.hasPolicyContent) {
                    // If policy content is present but no risky keywords, indicate presence.
                    description = `Privacy policy content found on ${analysis.hostname}`;
                }
                
                updateRiskIndicator(level, description);
            } else {
                // If injection returned no useful result, fall back to a message telling user how to proceed.
                const hostname = new URL(tab.url).hostname;
                updateRiskIndicator('safe', `${hostname} - No policy content detected. Use manual analysis below.`);
            }
            
        } catch (error) {
            // Errors here can occur due to injection permissions or CSP on the page.
            console.error('Real-time analysis error:', error);
            // Use hostname to provide context and suggest manual analysis.
            const hostname = new URL(tab.url).hostname;
            updateRiskIndicator('safe', `${hostname} - Click "Analyze Custom Policy" to check specific terms.`);
        }
    }

    function updateRiskIndicator(level, description) {
        // Map the internal level to user-facing text. 'analyzing' gets a different label.
        riskLevel.textContent = level === 'analyzing' ? 'Analyzing...' : 
                               level === 'safe' ? 'Safe' : 'Risky';
        
        // Apply a class so CSS can style the label (risk-safe, risk-risky, etc).
        riskLevel.className = `risk-${level}`;
        // Update the descriptive text shown below the indicator.
        riskDescription.textContent = description;
    }

    // Manual policy analysis flow triggered by the Analyze button in the popup.
    analyzeButton.addEventListener('click', async function() {
        // Read trimmed text from the textarea to avoid leading/trailing whitespace affecting length checks.
        const text = policyText.value.trim();
        
        // Simple input validation: require some text.
        if (!text) {
            alert('Please paste some policy text to analyze');
            return;
        }

        // Encourage a meaningful minimum to reduce false-negative/positive results.
        if (text.length < 100) {
            alert('Please provide more text for a meaningful analysis (at least 100 characters)');
            return;
        }

        try {
            // Disable button to prevent multiple concurrent requests and show a temporary label.
            analyzeButton.disabled = true;
            analyzeButton.textContent = 'Analyzing...';
            
            // Main analysis function (tries AI-enhanced flow and falls back to heuristics).
            await analyzePolicyText(text);
            
        } catch (error) {
            console.error('Analysis error:', error);
            showError('Failed to analyze policy text');
        } finally {
            // Restore button state regardless of success/failure.
            analyzeButton.disabled = false;
            analyzeButton.textContent = 'Analyze Policy';
        }
    });

    async function analyzePolicyText(text) {
        try {
            // These variables will hold progressively improved summaries.
            let summaryText = '';
            let enhancedSummary = '';
            
            // Attempt to use an available Summarizer API if the environment exposes one.
            if (window.ai && window.ai.summarizer) {
                try {
                    // Create a summarizer instance with a configuration tuned for concise key points.
                    const summarizer = await window.ai.summarizer.create({
                        type: 'key-points',
                        format: 'plain-text',
                        length: 'short'
                    });
                    // Summarize the provided policy text.
                    summaryText = await summarizer.summarize(text);
                } catch (error) {
                    // If the AI summarizer fails (network, quota), log and continue to fallbacks.
                    console.warn('Summarizer API failed:', error);
                }
            }
            
            // If we obtained a summary, attempt to enhance it with a writer API that can refocus on risks.
            if (window.ai && window.ai.writer && summaryText) {
                try {
                    const writer = await window.ai.writer.create({
                        tone: 'neutral',
                        format: 'plain-text',
                        length: 'short'
                    });
                    
                    // Provide a focused instruction so the writer highlights risks/benefits plainly.
                    const prompt = `Rewrite this privacy policy summary to highlight key risks and benefits in simple terms: ${summaryText}`;
                    enhancedSummary = await writer.write(prompt);
                } catch (error) {
                    // If writer fails, fall back to the plain summary we already have.
                    console.warn('Writer API failed:', error);
                    enhancedSummary = summaryText;
                }
            }
            
            // Optionally polish the final text for readability and tone with a rewriter API.
            if (window.ai && window.ai.rewriter && enhancedSummary) {
                try {
                    const rewriter = await window.ai.rewriter.create({
                        tone: 'more-casual',
                        length: 'shorter'
                    });
                    
                    enhancedSummary = await rewriter.rewrite(enhancedSummary);
                } catch (error) {
                    // Polishing is optional; if it fails, we keep the existing enhanced summary.
                    console.warn('Rewriter API failed:', error);
                }
            }
            
            // Run a local heuristic risk analysis (keyword-based) to derive risk score and found terms.
            const riskAnalysis = analyzeRiskFactors(text);
            
            // Choose the best available summary: AI-enhanced > AI summary > fallback generated text.
            const finalSummary = enhancedSummary || summaryText || `Policy contains ${text.split(/\s+/).length} words. Analysis based on risk keyword detection.`;
            
            // Render summary and detailed key points in the popup.
            displayAnalysisResults(finalSummary, riskAnalysis);
            
            // Update the compact risk indicator to reflect the heuristic analysis.
            updateRiskIndicator(riskAnalysis.level, riskAnalysis.description);

        } catch (error) {
            // Any unexpected error in the AI-enhanced path should trigger a robust fallback.
            console.error('Policy analysis error:', error);
            
            // Use the fallback heuristic-only analysis (no AI) and display those results.
            const fallbackAnalysis = performFallbackAnalysis(text);
            displayAnalysisResults(fallbackAnalysis.summary, fallbackAnalysis);
            updateRiskIndicator(fallbackAnalysis.level, fallbackAnalysis.description);
        }
    }

    function analyzeRiskFactors(text) {
        // Lists of keywords used for a heuristic risk assessment.
        // These are intentionally simple and case-insensitive to run quickly in the popup.
        const riskKeywords = [
            'sell your data', 'third parties', 'advertising partners', 'marketing purposes',
            'indefinitely', 'permanent', 'irrevocable', 'without notice', 'at our discretion',
            'no liability', 'as is', 'no warranty', 'indemnify', 'hold harmless'
        ];

        const positiveKeywords = [
            'not sell', 'not share', 'encrypted', 'secure', 'privacy protection',
            'opt-out', 'delete your data', 'user control', 'transparent'
        ];

        let riskScore = 0; // simple numeric score; higher means more risky
        const foundRisks = []; // list of matched risky phrases
        const foundPositives = []; // list of matched positive phrases

        // Iterate risk keywords and increment score for each match.
        riskKeywords.forEach(keyword => {
            if (text.toLowerCase().includes(keyword.toLowerCase())) {
                riskScore += 1;
                foundRisks.push(keyword);
            }
        });

        // Positive keywords reduce the score slightly to reflect mitigating language.
        positiveKeywords.forEach(keyword => {
            if (text.toLowerCase().includes(keyword.toLowerCase())) {
                riskScore -= 0.5;
                foundPositives.push(keyword);
            }
        });

        // Normalize to human-friendly level and a short description for the UI.
        let level, description;
        if (riskScore >= 3) {
            level = 'risky';
            description = 'Multiple risk factors detected. Review carefully before accepting.';
        } else if (riskScore >= 1) {
            level = 'risky';
            description = 'Some concerning terms found. Consider the implications.';
        } else {
            level = 'safe';
            description = 'No major red flags detected. Appears to be standard terms.';
        }

        // Return a compact object used by rendering functions and fallbacks.
        return {
            level,
            description,
            riskScore,
            foundRisks,
            foundPositives
        };
    }

    function performFallbackAnalysis(text) {
        // When AI is unavailable or fails, construct a readable summary using only heuristics.
        const wordCount = text.split(/\s+/).length;
        const riskAnalysis = analyzeRiskFactors(text);
        
        // Build a short natural-language summary describing what was found.
        let summary = `Analysis of ${wordCount} words completed using keyword detection. `;
        
        if (riskAnalysis.foundRisks.length > 0) {
            summary += `Found ${riskAnalysis.foundRisks.length} potential risk factor(s). `;
        }
        
        if (riskAnalysis.foundPositives.length > 0) {
            summary += `Also identified ${riskAnalysis.foundPositives.length} positive privacy aspect(s). `;
        }
        
        if (riskAnalysis.riskScore >= 3) {
            summary += `High risk score (${riskAnalysis.riskScore}) suggests careful review recommended.`;
        } else if (riskAnalysis.riskScore >= 1) {
            summary += `Moderate risk score (${riskAnalysis.riskScore}) - some concerns identified.`;
        } else {
            summary += `Low risk score (${riskAnalysis.riskScore}) - appears to be standard terms.`;
        }
        
        // Return the final object expected by displayAnalysisResults().
        return {
            summary: summary,
            level: riskAnalysis.level,
            description: riskAnalysis.description,
            riskScore: riskAnalysis.riskScore,
            foundRisks: riskAnalysis.foundRisks,
            foundPositives: riskAnalysis.foundPositives
        };
    }

    function displayAnalysisResults(summaryText, riskAnalysis) {
        // Set the main summary text; safe to assign directly since we control content.
        summary.textContent = summaryText;
        
        // Build HTML for key points: risk factors first, then positives to make concerns visible.
        let keyPointsHTML = '';
        if (riskAnalysis.foundRisks.length > 0) {
            // Use small headings and colored styles to visually separate risk items.
            keyPointsHTML += '<h4 style="color: #ffcdd2; margin-bottom: 5px;">⚠️ Risk Factors:</h4><ul>';
            riskAnalysis.foundRisks.forEach(risk => {
                keyPointsHTML += `<li>Contains "${risk}"</li>`;
            });
            keyPointsHTML += '</ul>';
        }
        
        if (riskAnalysis.foundPositives.length > 0) {
            keyPointsHTML += '<h4 style="color: #c8e6c9; margin-bottom: 5px; margin-top: 10px;">✅ Positive Aspects:</h4><ul>';
            riskAnalysis.foundPositives.forEach(positive => {
                keyPointsHTML += `<li>Mentions "${positive}"</li>`;
            });
            keyPointsHTML += '</ul>';
        }
        
        // Inject the assembled list into the DOM and ensure the results container is visible.
        keyPoints.innerHTML = keyPointsHTML;
        results.style.display = 'block';
    }

    function showError(message) {
        // Use the risk indicator to show a problem and log for diagnostics.
        updateRiskIndicator('risky', message);
        console.error('Policy Peek Error:', message);
    }
});