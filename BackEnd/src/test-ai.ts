import { callWebSearchLLM } from './lib/web-chat';
console.log('--- TEST START ---');
callWebSearchLLM([{ role: 'user', content: 'Hello' }], { useSearch: false })
    .then((res) => {
        console.log('Success');
        console.log('Response:', res.answer);
    })
    .catch((err) => {
        console.error('Error:', err);
    });
