// Simple JavaScript test script
const args = process.argv.slice(2);
const name = args[0] || 'World';

console.log(`Hello from JavaScript, ${name}!`);
console.log(`Current time: ${new Date().toISOString()}`);
