"""Local headless UI regression; no account or external service is used."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

OUTPUT = Path(__file__).resolve().parent
OUTPUT.mkdir(parents=True, exist_ok=True)
result = {"profile": "local-mock-docs-ui", "status": "FAIL", "checks": {}, "screenshots": [], "pageErrors": [], "consoleErrors": [], "failedRequests": []}

def measure(page):
    return page.evaluate("""() => ({width: innerWidth, scrollWidth: document.documentElement.scrollWidth, overflowing: [...document.querySelectorAll('main, aside, input, select')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => el.tagName)})""")

def capture(page, name):
    page.screenshot(path=str(OUTPUT / name), full_page=True)
    result["screenshots"].append(name)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("pageerror", lambda error: result["pageErrors"].append(str(error)))
        page.on("console", lambda message: result["consoleErrors"].append(message.text) if message.type == "error" else None)
        page.on("requestfailed", lambda request: result["failedRequests"].append({"url": request.url, "failure": request.failure}))
        response = page.goto("http://127.0.0.1:3100/docs/v1/template/local-journey", wait_until="domcontentloaded", timeout=90000)
        page.wait_for_load_state("networkidle")
        assert response.status == 200
        (OUTPUT / "desktop-aria.txt").write_text(page.locator("body").aria_snapshot(), encoding="utf-8")
        expect(page.get_by_role("navigation", name="Published documentation").get_by_role("link")).to_have_count(27)
        expect(page.get_by_label("Documentation version", exact=True)).to_have_value("v1")
        result["checks"]["publishedNavigation"] = "PASS (27 links, v1 selected)"
        capture(page, "desktop-1440.png")
        result["checks"]["desktopLayout"] = measure(page)
        assert result["checks"]["desktopLayout"]["scrollWidth"] <= 1440

        search = page.get_by_role("searchbox", name="Search published documentation")
        search.fill("private video")
        expect(page.get_by_role("status")).to_contain_text("result")
        for _ in range(6):
            page.keyboard.press("Tab")
            if page.evaluate("document.activeElement?.getAttribute('href')") == "/docs/v1/template/local-journey":
                break
        assert page.evaluate("document.activeElement?.getAttribute('href')") == "/docs/v1/template/local-journey"
        page.keyboard.press("Enter")
        page.wait_for_url("**/docs/v1/template/local-journey")
        page.wait_for_load_state("networkidle")
        result["checks"]["hydratedSearchAndKeyboardNavigation"] = "PASS"
        search = page.get_by_role("searchbox", name="Search published documentation")
        search.fill("notpresent-docs-ui-sentinel")
        expect(page.get_by_role("status")).to_have_text("No results in v1. Try another term.")
        page.get_by_role("button", name="Clear search", exact=True).click()
        expect(search).to_have_value("")
        expect(page.get_by_role("navigation", name="Published documentation").get_by_role("link")).to_have_count(27)
        result["checks"]["searchEmptyAndClear"] = "PASS"
        page.get_by_role("link", name="Template", exact=True).click()
        page.wait_for_url("**/docs/v1/template")
        page.wait_for_load_state("networkidle")
        expect(page.get_by_role("main")).to_contain_text("Template")
        result["checks"]["versionedNavigation"] = "PASS (only published v1 is selectable)"

        page.set_viewport_size({"width": 390, "height": 844})
        page.goto("http://127.0.0.1:3100/docs/v1/api/overview", wait_until="domcontentloaded", timeout=90000)
        page.wait_for_load_state("networkidle")
        result["checks"]["mobileLayout"] = measure(page)
        assert result["checks"]["mobileLayout"]["scrollWidth"] <= 390
        expect(page.get_by_role("searchbox", name="Search published documentation")).to_be_visible()
        capture(page, "mobile-390.png")

        page.set_viewport_size({"width": 1440, "height": 1000})
        response = page.goto("http://127.0.0.1:3200/docs/v1/template/local-journey", wait_until="domcontentloaded", timeout=90000)
        page.wait_for_timeout(1500)
        assert response.status == 200
        expect(page.get_by_role("searchbox", name="Search published documentation")).to_be_visible()
        result["checks"]["vendorProxyServerRendered"] = "PASS (200 with hydrated shell markup)"
        search = page.get_by_role("searchbox", name="Search published documentation")
        search.fill("private video")
        if page.get_by_role("status").count() == 0:
            raise AssertionError("Vendor proxy loaded the shell but no hydrated search status appeared")
        expect(page.get_by_role("status")).to_contain_text("result")
        result["checks"]["vendorProxyHydratedSearch"] = "PASS"
        result["checks"]["vendorImages"] = page.locator("img").evaluate_all("elements => elements.map(image => ({src: image.getAttribute('src'), loaded: image.complete && image.naturalWidth > 0}))")
        capture(page, "vendor-proxy-1440.png")
        assert all(image["loaded"] for image in result["checks"]["vendorImages"])
        assert not result["pageErrors"], result["pageErrors"]
        result["status"] = "PASS"
        browser.close()
except Exception as error:
    result["error"] = str(error)
    raise
finally:
    (OUTPUT / "result.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
