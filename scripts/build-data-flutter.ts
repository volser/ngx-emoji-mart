import emojiDataRaw from 'emoji-datasource/emoji.json';
import fs from 'fs';
import path from 'path';
import inflection from 'inflection';

import { EmojiData } from './emoji';

const emojiLib = require('emojilib');
// cast types to emojiData
// @ts-ignore
const emojiData: EmojiData[] = emojiDataRaw;
const categories: any[] = [];
const emojis: any[] = [];
const skins: any[] = [];
const categoriesIndex: any = {};

const catPairs = [
  ['Smileys & Emotion', 'smileys'],
  ['People & Body', 'people'],
  ['Animals & Nature', 'nature'],
  ['Food & Drink', 'foods'],
  ['Activities', 'activity'],
  ['Travel & Places', 'places'],
  ['Objects', 'objects'],
  ['Symbols', 'symbols'],
  ['Flags', 'flags'],
];
const sets = ['apple', 'google', 'twitter', 'facebook'];

catPairs.forEach((category, i) => {
  const [name, id] = category;
  categories[i] = { id, name, emojis: [] };
  categoriesIndex[name] = i;
});

emojiData.sort((a, b) => {
  const aTest = a.sort_order || a.short_name;
  const bTest = b.sort_order || b.short_name;

  // @ts-ignore
  return aTest - bTest;
});

function missingSets(datum: any) {
  const hidden: any[] = [];
  sets.forEach(x => {
    if (!datum[`has_img_${x}`]) {
      hidden.push(x);
    }
    delete datum[`has_img_${x}`];
  });
  if (!hidden.length) {
    return;
  }
  datum.hidden = hidden;
}

function setupSheet(datum: any) {
  datum.sheet = [datum.sheet_x, datum.sheet_y];
  delete datum.sheet_x;
  delete datum.sheet_y;
}

emojiData.forEach((datum: any) => {
  const category = datum.category;
  let categoryIndex: number;

  if (!datum.category) {
    throw new Error(`"${datum.short_name}" doesn’t have a category`);
  }

  if (!datum.name) {
    datum.name = datum.short_name.replace(/\-/g, ' ');
  }
  datum.name = inflection.titleize(datum.name || '');

  if (!datum.name) {
    throw new Error(`"${datum.short_name}" doesn’t have a name`);
  }

  datum.emoticons = datum.texts || [];
  datum.emoticons = datum.emoticons.map((x: string) => {
    if (x.endsWith('\\')) {
      return x + `\\`;
    }
    return x;
  });
  datum.text = datum.text || '';
  delete datum.texts;

  if (emojiLib.lib[datum.short_name]) {
    datum.keywords = emojiLib.lib[datum.short_name].keywords;
  }

  if (datum.category === 'Skin Tones') {
    skins.push(datum);
  } else {
    categoryIndex = categoriesIndex[category];
    categories[categoryIndex].emojis.push(datum.unified);
  }

  setupSheet(datum);

  missingSets(datum);
  if (datum.skin_variations) {
    datum.skinVariations = Object.keys(datum.skin_variations).map(key => {
      const variation = datum.skin_variations[key];
      setupSheet(variation);
      missingSets(variation);
      delete variation.added_in;
      delete variation.docomo;
      delete variation.au;
      delete variation.softbank;
      delete variation.google;
      delete variation.image;
      // delete variation.short_name;
      delete variation.non_qualified;
      delete variation.category;
      delete variation.sort_order;
      delete variation.obsoleted_by;
      delete variation.obsoletes;
      return variation;
    });
    delete datum.skin_variations;
  }

  datum.shortNames = datum.short_names.filter((i: any) => i !== datum.short_name);
  delete datum.short_names;

  // renaming
  datum.shortName = datum.short_name;
  delete datum.short_name;
  if (datum.obsoleted_by) {
    datum.obsoletedBy = datum.obsoleted_by;
  }
  delete datum.obsoleted_by;

  if (datum.text === '') {
    delete datum.text;
  }
  delete datum.added_in;
  delete datum.docomo;
  delete datum.au;
  delete datum.softbank;
  delete datum.google;
  delete datum.image;
  // delete datum.short_name;
  delete datum.non_qualified;
  delete datum.category;
  delete datum.sort_order;

  for (const key of Object.keys(datum)) {
    const value = datum[key];

    if (Array.isArray(value) && !value.length) {
      delete datum[key];
    }
  }

  emojis.push(datum);
});

const flags = categories[categoriesIndex.Flags];
flags.emojis = flags.emojis
  .filter((flag: any) => {
    // Until browsers support Flag UN
    if (flag === 'flag-un') {
      return;
    }
    return true;
  })
  .sort();

// Merge “Smileys & Emotion” and “People & Body” into a single category
const smileys = categories[0];
const people = categories[1];
const smileysAndPeople = {
  id: 'people',
  name: 'Smileys & People',
  emojis: [...smileys.emojis.slice(0, 114), ...people.emojis, ...smileys.emojis.slice(114)],
};

categories.unshift(smileysAndPeople);
categories.splice(1, 2);

const flutterEmojis: any[] = [];
categories.forEach(cat => {
  cat.emojis.forEach((unified: any) => {
    const emoji = emojis.find(em => em.unified === unified);
    if (emoji) {
      flutterEmojis.push({
        ...emoji,
        cat,
      });
    }
  });
});

const doc = `//Do't change (automatically generated)
import 'base_emoji.dart';

const emojiList = <Emoji>[
${flutterEmojis
  .map(e => {
    let catId = e.cat.id;
    if (catId === 'foods') {
      catId = 'food';
    }
    if (catId === 'places') {
      catId = 'travel';
    }
    return `  Emoji('${e.name}', '${e.unified}', EmojiCategory.${catId})`;
  })
  .join(',\n')}
];
`;
fs.writeFileSync(path.join(__dirname, '../flutter/all_emojis.dart'), doc);
