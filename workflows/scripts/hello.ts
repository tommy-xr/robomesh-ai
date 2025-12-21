// Simple TypeScript test script
const args = process.argv.slice(2);
const name = args[0] || 'World';

console.log(`Hello from TypeScript, ${name}!`);
console.log(`Current time: ${new Date().toISOString()}`);
