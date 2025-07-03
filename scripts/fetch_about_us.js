const { exec } = require('child_process');
const fs = require('fs/promises');

exec('curl -s https://automationghana.com/wp-json/wp/v2/pages?slug=new-home-2', async (err, stdout, stderr) => {
  if (err) {
    console.error('Failed to fetch About Us:', err);
    process.exitCode = 1;
    return;
  }
  try {
    const pages = JSON.parse(stdout);
    const excerptHtml = pages[0]?.excerpt?.rendered || '';
    const text = excerptHtml
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    await fs.mkdir('public/knowledge_base', { recursive: true });
    await fs.writeFile('public/knowledge_base/about_us.md', `${text}\n`);
    console.log('Saved about_us.md');
  } catch (e) {
    console.error('Error processing fetched data:', e);
    process.exitCode = 1;
  }
});
