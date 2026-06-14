import { callWebSearchLLM } from './lib/web-chat.js';
console.log('--- TEST START ---');
callWebSearchLLM([{ role: 'user', content: 'Hello' }], { useSearch: false })
    .then((res) => {
        console.log('Success');
        console.log('Response:', res.choices[0].message.content);
    })
    .catch((err) => {
        console.error('Error:', err);
    });
