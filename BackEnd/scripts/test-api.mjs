async function checkKey() {
    console.log("Checking API Key...");
    try {
        const res = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'sonar',
                messages: [{ role: 'user', content: 'test' }]
            })
        });
        
        console.log("Success! Perplexity API works. Status:", res.status);
        if(!res.ok) {
            console.log("Error body:", await res.text());
        }
    } catch (err) {
        console.log("Error:", err.message);
    }
}

checkKey();
