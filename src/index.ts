import { stringify } from "csv-stringify";
import puppeteer, { Page } from "puppeteer";
import * as fs from "fs";
import * as os from "os";

interface Item {
  title?: string;
  address?: string;
  phoneNumber?: string;
}

const selector = {
  itemLink: ".hfpxzc",
  titleForValidation: ".NrDZNb",
  title: ".DUwDvf",
  address: "[data-item-id='address']",
  phoneNumber: "[data-item-id^='phone']",
};

const delay = (millis: number) =>
  new Promise<void>((res) => {
    setTimeout(() => {
      res();
    }, millis);
  });

const infiniteScroll = async (page: Page) => {
  const scrollSelector = "[role='feed']";
  const lastPageSelector = ".HlvSq";

  const currentHeight = await page.evaluate((selector) => {
    const element = document.querySelector(selector);
    element?.scrollTo({ top: element.scrollHeight, behavior: "instant" });
    return element?.scrollHeight;
  }, scrollSelector);
  console.log(`scroll status : ${currentHeight}`);
  await delay(1000);
  if (
    !(await page.evaluate(
      (selector) => document.querySelector(selector),
      lastPageSelector
    ))
  ) {
    await infiniteScroll(page);
  }
};

const stringifyCsv = (list: any[]) =>
  new Promise<string>((res, rej) => {
    stringify(list, { header: true }, (err, output) => {
      if (err) {
        rej(err);
      } else {
        res(output);
      }
    });
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
    return { title, address, phoneNumber };
  }, selector);
};

const waitForPageLoaded = async (page: Page, index: number) => {
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
    await waitForPageLoaded(page, index);
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
  await infiniteScroll(page);

  console.log("fetching data...");
  const links = await page.$$(selector.itemLink);
  for (let i = 0; i < links.length; i++) {
    await links[i].click();
    await waitForPageLoaded(page, i);
    items.push(await fetchData(page));
    console.log(`${i + 1}/${links.length}`);
  }

  console.log("saving data on desktop...");
  const homeDir = os.homedir();
  fs.writeFileSync(
    `${homeDir}/Desktop/${keyword}.csv`,
    await stringifyCsv(items),
    { encoding: "utf-8" }
  );
  await browser.close();
  console.log("done");
};

init(process.argv[2]);
