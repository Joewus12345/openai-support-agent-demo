const fs = require('fs/promises');

async function fetchAboutUs() {
  try {
    const res = await fetch(
      'https://automationghana.com/wp-json/wp/v2/pages?slug=new-home-2',
    );
    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }
    const pages = await res.json();
    const html = pages[0]?.content?.rendered || '';

    let md = html
      .replace(/<h1[^>]*>(.*?)<\/h1>/gis, (_, t) => `# ${t}\n\n`)
      .replace(/<h2[^>]*>(.*?)<\/h2>/gis, (_, t) => `## ${t}\n\n`)
      .replace(/<h3[^>]*>(.*?)<\/h3>/gis, (_, t) => `### ${t}\n\n`)
      .replace(/<p[^>]*>(.*?)<\/p>/gis, (_, t) => `${t}\n\n`)
      .replace(/<li[^>]*>(.*?)<\/li>/gis, (_, t) => `- ${t}\n`)
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\n{3,}/g, '\n\n');

    md = md
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n');

    await fs.mkdir('public/knowledge_base', { recursive: true });
    await fs.writeFile('public/knowledge_base/about_us.md', `${md}\n`);
    console.log('Saved about_us.md');
  } catch (e) {
    console.error('Failed to fetch or process About Us:', e);
    process.exitCode = 1;
  }
}

fetchAboutUs();
