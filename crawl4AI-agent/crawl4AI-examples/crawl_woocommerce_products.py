import asyncio
import os
from typing import List
from urllib.parse import urlparse
import requests

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator

CATEGORIES = [
    "https://store.automationghana.com/product-category/building-essentials/",
    "https://store.automationghana.com/product-category/cables-cable-management/",
    "https://store.automationghana.com/product-category/electrical-power-distribution/",
    "https://store.automationghana.com/product-category/enclosures-and-junction-boxes/",
    "https://store.automationghana.com/product-category/hioki/",
    "https://store.automationghana.com/product-category/industrial-automation/",
    "https://store.automationghana.com/product-category/industrial-controls/",
    "https://store.automationghana.com/product-category/invisible-category/",
    "https://store.automationghana.com/product-category/legacy-items/",
    "https://store.automationghana.com/product-category/lighting-switches-and-sockets/",
    "https://store.automationghana.com/product-category/ppes/",
    "https://store.automationghana.com/product-category/renewables/",
    "https://store.automationghana.com/product-category/sinova-siemens/",
    "https://store.automationghana.com/product-category/smart-home/",
    "https://store.automationghana.com/product-category/special-promotions/",
    "https://store.automationghana.com/product-category/tools-and-measuring-equipment/",
]

API_BASE = "https://store.automationghana.com/wp-json/wp/v2"

PROJECT_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "public", "knowledge_base")
os.makedirs(OUTPUT_DIR, exist_ok=True)


def _slugify(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path.strip("/") or "index"
    filename = f"{parsed.netloc}_{path}".replace("/", "_")
    return filename


def _save_markdown(url: str, markdown: str) -> None:
    file_path = os.path.join(OUTPUT_DIR, f"{_slugify(url)}.md")
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(markdown)


def get_category_id(slug: str) -> int:
    resp = requests.get(f"{API_BASE}/product_cat", params={"slug": slug}, timeout=20)
    resp.raise_for_status()
    data = resp.json()
    if not data:
        raise ValueError(f"Category not found for slug: {slug}")
    return data[0]["id"]


def fetch_product_urls(cat_id: int) -> List[str]:
    urls: List[str] = []
    page = 1
    while True:
        resp = requests.get(
            f"{API_BASE}/product",
            params={"product_cat": cat_id, "per_page": 100, "page": page},
            timeout=20,
        )
        if resp.status_code != 200:
            break
        data = resp.json()
        if not data:
            break
        urls.extend(item.get("link") for item in data if item.get("link"))
        page += 1
    return urls


async def crawl_products(urls: List[str]):
    browser_config = BrowserConfig(
        headless=True,
        extra_args=["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox"],
    )
    crawl_config = CrawlerRunConfig(markdown_generator=DefaultMarkdownGenerator())

    crawler = AsyncWebCrawler(config=browser_config)
    await crawler.start()

    try:
        session_id = "woocommerce_session"
        for url in urls:
            result = await crawler.arun(url=url, config=crawl_config, session_id=session_id)
            if result.success:
                markdown = getattr(getattr(result, "markdown", None), "raw_markdown", getattr(result, "markdown", ""))
                _save_markdown(url, markdown)
                print(f"Saved markdown for {url}")
            else:
                print(f"Failed to crawl {url}: {result.error_message}")
    finally:
        await crawler.close()


async def main():
    product_urls: List[str] = []
    for cat_url in CATEGORIES:
        slug = cat_url.rstrip("/").split("/")[-1]
        try:
            cat_id = get_category_id(slug)
        except Exception as e:
            print(f"Could not find ID for {slug}: {e}")
            continue
        urls = fetch_product_urls(cat_id)
        print(f"{slug}: found {len(urls)} products")
        product_urls.extend(urls)

    if product_urls:
        await crawl_products(product_urls)
    else:
        print("No product URLs found")


if __name__ == "__main__":
    asyncio.run(main())
