import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const PORT = process.env.PORT || 5175;
const BASE_URL = `http://localhost:${PORT}/api/health/diagnostics`;

async function main() {
    console.log(`Checking Health Diagnostics at ${BASE_URL}...`);

    try {
        const start = Date.now();
        const response = await axios.get(BASE_URL);
        const duration = Date.now() - start;

        console.log(`\n✅ Status Code: ${response.status}`);
        console.log(`⏱️ Duration: ${duration}ms (Network + Server)`);

        console.log('\nResponse Data:');
        console.log(JSON.stringify(response.data, null, 2));

        const { status, checks } = response.data;

        if (status === 'OK' || status === 'DEGRADED') {
            console.log(`\n🎉 Test Passed: Endpoint is reachable and returning formatted JSON.`);
            if (status === 'DEGRADED') {
                console.warn('⚠️ Warning: System is DEGRADED. Check individual components above.');
            }
        } else {
            console.error('\n❌ Test Failed: System reported DOWN status.');
            process.exit(1);
        }

    } catch (error: any) {
        if (error.code === 'ECONNREFUSED') {
            console.error(`\n❌ Could not connect to ${BASE_URL}. Is the server running?`);
            console.error('Run "npm run dev" in the backend folder to start the server.');
        } else {
            console.error(`\n❌ Request failed: ${error.message}`);
            if (error.response) {
                console.error('Status:', error.response.status);
                console.error('Data:', JSON.stringify(error.response.data, null, 2));
            }
        }
        process.exit(1);
    }
}

main();
