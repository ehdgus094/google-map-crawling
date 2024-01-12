import { stringify } from "csv-stringify";
import puppeteer, { ElementHandle, Page } from "puppeteer";
import * as fs from "fs";
import * as os from "os";

interface Item {
  title?: string;
  address?: string;
  phoneNumber?: string;
  websiteUrl?: string;
}

const overwriteLog = (message: string) => {
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
  process.stdout.write(message);
};

const selector = {
  // inputText: ".searchboxinput",
  scroll: "[role='feed']",
  lastPage: ".HlvSq",
  itemLink: ".hfpxzc",
  titleForValidation: ".NrDZNb",
  title: ".DUwDvf",
  address: "[data-item-id='address']",
  phoneNumber: "[data-item-id^='phone']",
  websiteUrl: "[data-item-id='authority']",
};

const delay = (millis: number) =>
  new Promise<void>((res) => {
    setTimeout(() => {
      res();
    }, millis);
  });

// const search = async (page: Page, keyword: string) => {
//   await page.focus(selector.inputText);
//   await page.keyboard.type(`${keyword}\n`);
// };

const infiniteScroll = async (
  page: Page,
  timer: number = 100,
  prevHeight: number = 0
): Promise<boolean> => {
  const currentHeight = await page.evaluate((selector) => {
    const element = document.querySelector(selector.scroll);
    element?.scrollTo({ top: element.scrollHeight, behavior: "instant" });
    return element?.scrollHeight;
  }, selector);

  if (currentHeight) {
    overwriteLog(`scroll status : ${currentHeight}, timer : ${timer}`);
    if (prevHeight === currentHeight) {
      if (timer-- <= 0) {
        overwriteLog(`scroll status : ${currentHeight}`);
        return false;
      }
    } else {
      timer = 100;
    }

    if (
      !(await page.evaluate(
        (selector) => document.querySelector(selector.lastPage),
        selector
      ))
    ) {
      await delay(100);
      return await infiniteScroll(page, timer, currentHeight);
    }
    overwriteLog(`scroll status : ${currentHeight}`);
    return true;
  } else {
    console.log("invalid search keyword");
    process.exit();
  }
};

const stringifyCsv = (list: any[]) =>
  new Promise<string>((res, rej) => {
    stringify(
      list,
      {
        header: true,
        columns: ["title", "address", "phoneNumber", "websiteUrl"],
        bom: true,
      },
      (err, output) => {
        if (err) {
          rej(err);
        } else {
          res(output);
        }
      }
    );
  });

const fetchData = async (page: Page): Promise<Item> => {
  return await page.evaluate((selector) => {
    const title = document.querySelector(selector.title)?.textContent?.trim();
    const address = document
      .querySelector(selector.address)
      ?.textContent?.trim();
    const phoneNumber = document
      .querySelector(selector.phoneNumber)
      ?.textContent?.trim();
    const websiteUrl = document
      .querySelector(selector.websiteUrl)
      ?.getAttribute("href")
      ?.trim();
    return { title, address, phoneNumber, websiteUrl };
  }, selector);
};

const clickItem = async (
  page: Page,
  element: ElementHandle<Element>,
  index: number
) => {
  await element.click();
  const validated = await page.evaluate(
    (selector, index) => {
      const titleForValidation = [
        ...document.querySelectorAll(selector.titleForValidation),
      ][index].textContent?.trim();
      const title = document.querySelector(selector.title)?.textContent?.trim();
      return titleForValidation === title;
    },
    selector,
    index
  );
  if (!validated) {
    await delay(100);
    await clickItem(page, element, index);
  }
};

const init = async (keyword: string) => {
  const items: Item[] = [];

  console.log("navigating page...");
  const browser = await puppeteer.launch({
    // headless: false,
    headless: "new",
    defaultViewport: null,
  });
  const page = (await browser.pages())[0];
  await page.goto(`https://www.google.com/maps/search/${keyword}`);

  console.log("scrolling list...");
  if (!(await infiniteScroll(page))) {
    await browser.close();
    console.log("\nfailed to scroll to the end. retrying...");
    return await init(keyword);
  }

  console.log("\nfetching data...");
  const links = await page.$$(selector.itemLink);
  for (let i = 0; i < links.length; i++) {
    await clickItem(page, links[i], i);
    items.push(await fetchData(page));
    overwriteLog(`${i + 1}/${links.length}`);
  }

  console.log("\nsaving data on desktop...");
  const homeDir = os.homedir();
  fs.writeFileSync(
    `${homeDir}/Desktop/${keyword}.csv`,
    await stringifyCsv(items)
  );
  await browser.close();
  console.log("done");
};

init(process.argv.slice(2).join(" "));
