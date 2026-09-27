/**
 * Converts a numeric amount to Bengali words.
 * e.g. 5250.50 → "পাঁচ হাজার দুইশত পঞ্চাশ টাকা পঞ্চাশ পয়সা মাত্র"
 */

const BN: string[] = [
  '', 'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়',
  'দশ', 'এগার', 'বার', 'তের', 'চৌদ্দ', 'পনের', 'ষোল', 'সতের', 'আঠার', 'উনিশ',
  'বিশ', 'একুশ', 'বাইশ', 'তেইশ', 'চব্বিশ', 'পঁচিশ', 'ছাব্বিশ', 'সাতাশ', 'আঠাশ', 'উনত্রিশ',
  'ত্রিশ', 'একত্রিশ', 'বত্রিশ', 'তেত্রিশ', 'চৌত্রিশ', 'পঁয়ত্রিশ', 'ছত্রিশ', 'সাতত্রিশ', 'আটত্রিশ', 'উনচল্লিশ',
  'চল্লিশ', 'একচল্লিশ', 'বেয়াল্লিশ', 'তেতাল্লিশ', 'চৌতাল্লিশ', 'পঁয়তাল্লিশ', 'ছেচল্লিশ', 'সাতচল্লিশ', 'আটচল্লিশ', 'উনপঞ্চাশ',
  'পঞ্চাশ', 'একান্ন', 'বায়ান্ন', 'তিপান্ন', 'চুয়ান্ন', 'পঞ্চান্ন', 'ছাপান্ন', 'সাতান্ন', 'আটান্ন', 'উনষাট',
  'ষাট', 'একষট্টি', 'বাষট্টি', 'তেষট্টি', 'চৌষট্টি', 'পঁয়ষট্টি', 'ছেষট্টি', 'সাতষট্টি', 'আটষট্টি', 'উনসত্তর',
  'সত্তর', 'একাত্তর', 'বাহাত্তর', 'তিয়াত্তর', 'চুয়াত্তর', 'পঁচাত্তর', 'ছিয়াত্তর', 'সাতাত্তর', 'আটাত্তর', 'উনআশি',
  'আশি', 'একাশি', 'বিরাশি', 'তিরাশি', 'চুরাশি', 'পঁচাশি', 'ছিয়াশি', 'সাতাশি', 'আটাশি', 'উননব্বই',
  'নব্বই', 'একানব্বই', 'বিরানব্বই', 'তিরানব্বই', 'চুরানব্বই', 'পঁচানব্বই', 'ছিয়ানব্বই', 'সাতানব্বই', 'আটানব্বই', 'নিরানব্বই',
];

function convertHundreds(n: number): string {
  if (n <= 0) return '';
  if (n < 100) return BN[n];
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;
  const hundredPart = `${BN[hundreds]} শত`;
  return remainder > 0 ? `${hundredPart} ${BN[remainder]}` : hundredPart;
}

export function numberToBengaliWords(amount: number): string {
  const taka = Math.floor(Math.abs(amount));
  const paisa = Math.round((Math.abs(amount) - taka) * 100);

  if (taka === 0 && paisa === 0) return 'শূন্য টাকা মাত্র';

  const parts: string[] = [];
  let remaining = taka;

  const crore = Math.floor(remaining / 10_000_000);
  remaining %= 10_000_000;
  const lakh = Math.floor(remaining / 100_000);
  remaining %= 100_000;
  const hazar = Math.floor(remaining / 1_000);
  remaining %= 1_000;

  if (crore > 0) parts.push(`${convertHundreds(crore)} কোটি`);
  if (lakh > 0) parts.push(`${convertHundreds(lakh)} লক্ষ`);
  if (hazar > 0) parts.push(`${convertHundreds(hazar)} হাজার`);
  if (remaining > 0) parts.push(convertHundreds(remaining));

  let result = parts.join(' ') + ' টাকা';
  if (paisa > 0) result += ` ${BN[paisa]} পয়সা`;
  result += ' মাত্র';

  return result.trim();
}
