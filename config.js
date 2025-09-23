// Policy Peek Configuration
// This file loads environment variables and API keys

const CONFIG = {
    // Chrome Extension ID
    CHROME_ID: "lgoiiihmghnifhppgdjgdogppbjepbbp",
    
    // Chrome Built-in AI API Tokens
    CHROME_WRITER_API: "A61NocUACQdI6l8ldQ1sCa8gi2IuE0DbweKksc9G3GTcjntbNXPmNOOvaoJemst6fNkShqUlu82TfMIkbBYO4Q8AAACAeyJvcmlnaW4iOiJjaHJvbWUtZXh0ZW5zaW9uOi8vbGdvaWlpaG1naG5pZmhwcGdkamdkb2dwcGJqZXBiYnAiLCJmZWF0dXJlIjoiQUlXcml0ZXJBUEkiLCJleHBpcnkiOjE3Njk0NzIwMDAsImlzVGhpcmRQYXJ0eSI6dHJ1ZX0=",
    
    CHROME_REWRITER_API: "AzBtegCBY7n56LeZHe7MGIWWVx8RGlyQaChIppnJ1fpOFe9WnLrLW9Qp0xrM2acoUXEBemHzzhWfGx9ugX67rwYAAACCeyJvcmlnaW4iOiJjaHJvbWUtZXh0ZW5zaW9uOi8vbGdvaWlpaG1naG5pZmhwcGdkamdkb2dwcGJqZXBiYnAiLCJmZWF0dXJlIjoiQUlSZXdyaXRlckFQSSIsImV4cGlyeSI6MTc2OTQ3MjAwMCwiaXNUaGlyZFBhcnR5Ijp0cnVlfQ==",
    
    // Feature flags
    ENABLE_EXTERNAL_AI: false,
    ENABLE_HISTORY_CHECKER: true,
    ENABLE_TRANSLATION: true,
    
    // API endpoints
    POLICY_ANALYSIS_API_URL: 'https://api.example.com/analyze'
};

// Initialize Chrome Built-in AI APIs with tokens
function initializeAIAPIs() {
    try {
        // Add origin trial tokens to enable Chrome Built-in AI APIs
        if (CONFIG.CHROME_WRITER_API) {
            const writerMeta = document.createElement('meta');
            writerMeta.httpEquiv = 'origin-trial';
            writerMeta.content = CONFIG.CHROME_WRITER_API;
            document.head.appendChild(writerMeta);
        }
        
        if (CONFIG.CHROME_REWRITER_API) {
            const rewriterMeta = document.createElement('meta');
            rewriterMeta.httpEquiv = 'origin-trial';
            rewriterMeta.content = CONFIG.CHROME_REWRITER_API;
            document.head.appendChild(rewriterMeta);
        }
        
        console.log('Chrome Built-in AI API tokens initialized');
    } catch (error) {
        console.error('Failed to initialize AI API tokens:', error);
    }
}

// Check if Chrome Built-in AI APIs are available
async function checkAIAvailability() {
    const availability = {
        summarizer: false,
        writer: false,
        rewriter: false,
        translator: false,
        proofreader: false
    };
    
    try {
        if (typeof window !== 'undefined' && window.ai) {
            // Check each API individually to avoid errors
            try { availability.summarizer = !!window.ai.summarizer; } catch (e) { /* ignore */ }
            try { availability.writer = !!window.ai.writer; } catch (e) { /* ignore */ }
            try { availability.rewriter = !!window.ai.rewriter; } catch (e) { /* ignore */ }
            try { availability.translator = !!window.ai.translator; } catch (e) { /* ignore */ }
            try { availability.proofreader = !!window.ai.proofreader; } catch (e) { /* ignore */ }
        } else {
            console.info('Chrome Built-in AI APIs not available - running in fallback mode');
        }
    } catch (error) {
        console.warn('Error checking AI availability, continuing with fallback mode:', error);
    }
    
    return availability;
}

// Export configuration
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CONFIG, initializeAIAPIs, checkAIAvailability };
} else {
    window.PolicyPeekConfig = { CONFIG, initializeAIAPIs, checkAIAvailability };
}
