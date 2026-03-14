const axios = require('axios');
require('dotenv').config();

async function checkKey() {
    console.log("Checking API Key...");
    try {
        const res = await axios.post(
            'https://api.perplexity.ai/chat/completions',
            {
                model: 'sonar',
                messages: [{ role: 'user', content: 'test' }]
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log("Success! Perplexity API works. Status:", res.status);
    } catch (err) {
        console.log("Error:", err.message);
        if (err.response) {
            console.log("Response data:", err.response.data);
            console.log("Status:", err.response.status);
        }
    }
}

checkKey();
