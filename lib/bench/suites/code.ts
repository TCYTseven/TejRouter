import type { BenchSuite } from "../types";
import { FORMAT, makeTask, type TaskInput } from "./util";

const SUITE = "code";

interface CodeTask {
  id: string;
  category: string;
  difficulty: number;
  fn: string;
  signature: string;
  spec: string;
  /** Reference implementation; used as `expected` (and therefore by the simulators). */
  ref: string;
  tests: { args: unknown[]; expected: unknown }[];
}

/**
 * Function-writing tasks graded by running the reply against hidden tests in a sandbox.
 * Test expectations are written by hand, independently of the reference implementations;
 * suites.test.ts checks every reference passes its own tests.
 */
const TASKS: CodeTask[] = [
  {
    id: "sum-array",
    category: "basics",
    difficulty: 0.05,
    fn: "sumArray",
    signature: "sumArray(nums)",
    spec: "returns the sum of an array of numbers (0 for an empty array).",
    ref: `function sumArray(nums) {
  let s = 0;
  for (const n of nums) s += n;
  return s;
}`,
    tests: [
      { args: [[1, 2, 3]], expected: 6 },
      { args: [[]], expected: 0 },
      { args: [[-5, 5, 10]], expected: 10 },
      { args: [[0.5, 0.25]], expected: 0.75 },
    ],
  },
  {
    id: "reverse-string",
    category: "basics",
    difficulty: 0.05,
    fn: "reverseString",
    signature: "reverseString(s)",
    spec: "returns the string s reversed.",
    ref: `function reverseString(s) {
  return s.split("").reverse().join("");
}`,
    tests: [
      { args: ["hello"], expected: "olleh" },
      { args: [""], expected: "" },
      { args: ["ab c"], expected: "c ba" },
    ],
  },
  {
    id: "count-vowels",
    category: "basics",
    difficulty: 0.1,
    fn: "countVowels",
    signature: "countVowels(s)",
    spec: "returns how many vowels (a, e, i, o, u, case-insensitive; y is not a vowel) the string contains.",
    ref: `function countVowels(s) {
  return (s.match(/[aeiou]/gi) || []).length;
}`,
    tests: [
      { args: ["Hello World"], expected: 3 },
      { args: ["rhythm"], expected: 0 },
      { args: ["AEIOUaeiou"], expected: 10 },
      { args: [""], expected: 0 },
    ],
  },
  {
    id: "gcd",
    category: "basics",
    difficulty: 0.15,
    fn: "gcd",
    signature: "gcd(a, b)",
    spec: "returns the greatest common divisor of two non-negative integers (gcd(0, n) = n).",
    ref: `function gcd(a, b) {
  while (b) { const t = a % b; a = b; b = t; }
  return a;
}`,
    tests: [
      { args: [48, 18], expected: 6 },
      { args: [0, 5], expected: 5 },
      { args: [17, 13], expected: 1 },
      { args: [1071, 462], expected: 21 },
    ],
  },
  {
    id: "fizzbuzz",
    category: "basics",
    difficulty: 0.15,
    fn: "fizzBuzz",
    signature: "fizzBuzz(n)",
    spec: 'returns an array of strings for 1..n where multiples of 3 are "Fizz", multiples of 5 are "Buzz", multiples of both are "FizzBuzz", and other numbers are their decimal string.',
    ref: `function fizzBuzz(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push(i % 15 === 0 ? "FizzBuzz" : i % 3 === 0 ? "Fizz" : i % 5 === 0 ? "Buzz" : String(i));
  }
  return out;
}`,
    tests: [
      { args: [5], expected: ["1", "2", "Fizz", "4", "Buzz"] },
      { args: [0], expected: [] },
      { args: [15], expected: ["1", "2", "Fizz", "4", "Buzz", "Fizz", "7", "8", "Fizz", "Buzz", "11", "Fizz", "13", "14", "FizzBuzz"] },
    ],
  },
  {
    id: "palindrome",
    category: "strings",
    difficulty: 0.2,
    fn: "isPalindrome",
    signature: "isPalindrome(s)",
    spec: "returns true if s reads the same forwards and backwards after lowercasing and removing every character that is not a letter or digit.",
    ref: `function isPalindrome(s) {
  const t = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return t === t.split("").reverse().join("");
}`,
    tests: [
      { args: ["A man, a plan, a canal: Panama"], expected: true },
      { args: ["race a car"], expected: false },
      { args: [""], expected: true },
      { args: ["No 'x' in Nixon"], expected: true },
      { args: ["ab2a"], expected: false },
    ],
  },
  {
    id: "longest-common-prefix",
    category: "strings",
    difficulty: 0.2,
    fn: "longestCommonPrefix",
    signature: "longestCommonPrefix(strs)",
    spec: 'returns the longest common prefix of an array of strings ("" if there is none or the array is empty).',
    ref: `function longestCommonPrefix(strs) {
  if (!strs.length) return "";
  let p = strs[0];
  for (const s of strs) while (!s.startsWith(p)) p = p.slice(0, -1);
  return p;
}`,
    tests: [
      { args: [["flower", "flow", "flight"]], expected: "fl" },
      { args: [["dog", "racecar", "car"]], expected: "" },
      { args: [[]], expected: "" },
      { args: [["same", "same"]], expected: "same" },
    ],
  },
  {
    id: "run-length",
    category: "strings",
    difficulty: 0.3,
    fn: "rle",
    signature: "rle(s)",
    spec: 'returns the run-length encoding of s as character followed by run length, e.g. "aaabcc" -> "a3b1c2".',
    ref: `function rle(s) {
  let out = "";
  for (let i = 0; i < s.length; ) {
    let j = i;
    while (j < s.length && s[j] === s[i]) j++;
    out += s[i] + (j - i);
    i = j;
  }
  return out;
}`,
    tests: [
      { args: ["aaabcc"], expected: "a3b1c2" },
      { args: [""], expected: "" },
      { args: ["zzzzzzzzzzzz"], expected: "z12" },
      { args: ["abab"], expected: "a1b1a1b1" },
    ],
  },
  {
    id: "parse-duration",
    category: "strings",
    difficulty: 0.35,
    fn: "parseDuration",
    signature: "parseDuration(s)",
    spec: 'converts a duration string made of optional hour, minute and second parts such as "1h30m", "45s" or "2h5s" into a total number of seconds.',
    ref: `function parseDuration(s) {
  let total = 0;
  const re = /(\\d+)([hms])/g;
  let m;
  while ((m = re.exec(s))) total += Number(m[1]) * (m[2] === "h" ? 3600 : m[2] === "m" ? 60 : 1);
  return total;
}`,
    tests: [
      { args: ["1h30m"], expected: 5400 },
      { args: ["45s"], expected: 45 },
      { args: ["2h"], expected: 7200 },
      { args: ["1h1m1s"], expected: 3661 },
      { args: ["90m"], expected: 5400 },
      { args: ["2h5s"], expected: 7205 },
    ],
  },
  {
    id: "add-binary",
    category: "strings",
    difficulty: 0.3,
    fn: "addBinary",
    signature: "addBinary(a, b)",
    spec: "adds two non-negative binary numbers given as strings (possibly longer than 64 bits) and returns their sum as a binary string without leading zeros (\"0\" for zero).",
    ref: `function addBinary(a, b) {
  let i = a.length - 1, j = b.length - 1, carry = 0, out = "";
  while (i >= 0 || j >= 0 || carry) {
    const s = (i >= 0 ? +a[i--] : 0) + (j >= 0 ? +b[j--] : 0) + carry;
    out = (s % 2) + out;
    carry = s >> 1;
  }
  out = out.replace(/^0+/, "");
  return out || "0";
}`,
    tests: [
      { args: ["11", "1"], expected: "100" },
      { args: ["1010", "1011"], expected: "10101" },
      { args: ["0", "0"], expected: "0" },
      {
        args: ["1111111111111111111111111111111111111111111111111111111111111111111111", "1"],
        expected: "10000000000000000000000000000000000000000000000000000000000000000000000",
      },
    ],
  },
  {
    id: "balanced-brackets",
    category: "algorithms",
    difficulty: 0.35,
    fn: "isBalanced",
    signature: "isBalanced(s)",
    spec: "returns true if every bracket among (), [] and {} in s is properly matched and nested; all other characters are ignored.",
    ref: `function isBalanced(s) {
  const st = [];
  const pairs = { ")": "(", "]": "[", "}": "{" };
  for (const c of s) {
    if (c === "(" || c === "[" || c === "{") st.push(c);
    else if (c in pairs) { if (st.pop() !== pairs[c]) return false; }
  }
  return st.length === 0;
}`,
    tests: [
      { args: ["([]{})"], expected: true },
      { args: ["([)]"], expected: false },
      { args: ["a(b)c[d]{e}"], expected: true },
      { args: ["(("], expected: false },
      { args: ["}"], expected: false },
      { args: [""], expected: true },
    ],
  },
  {
    id: "flatten",
    category: "algorithms",
    difficulty: 0.3,
    fn: "flatten",
    signature: "flatten(arr)",
    spec: "returns a new array with all nested arrays flattened to any depth, preserving order.",
    ref: `function flatten(arr) {
  const out = [];
  for (const x of arr) Array.isArray(x) ? out.push(...flatten(x)) : out.push(x);
  return out;
}`,
    tests: [
      { args: [[1, [2, [3, [4]]], 5]], expected: [1, 2, 3, 4, 5] },
      { args: [[]], expected: [] },
      { args: [[[[]], ["a"]]], expected: ["a"] },
    ],
  },
  {
    id: "max-subarray",
    category: "algorithms",
    difficulty: 0.35,
    fn: "maxSubarray",
    signature: "maxSubarray(nums)",
    spec: "returns the largest sum of any non-empty contiguous subarray of a non-empty array of integers.",
    ref: `function maxSubarray(nums) {
  let best = nums[0], cur = nums[0];
  for (let i = 1; i < nums.length; i++) {
    cur = Math.max(nums[i], cur + nums[i]);
    best = Math.max(best, cur);
  }
  return best;
}`,
    tests: [
      { args: [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], expected: 6 },
      { args: [[-3, -1, -2]], expected: -1 },
      { args: [[5]], expected: 5 },
      { args: [[2, -1, 2, -1, 2]], expected: 4 },
    ],
  },
  {
    id: "to-roman",
    category: "algorithms",
    difficulty: 0.4,
    fn: "toRoman",
    signature: "toRoman(n)",
    spec: "converts an integer 1..3999 to a standard Roman numeral string (subtractive notation, e.g. 4 = IV, 90 = XC).",
    ref: `function toRoman(n) {
  const t = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of t) while (n >= v) { out += s; n -= v; }
  return out;
}`,
    tests: [
      { args: [3], expected: "III" },
      { args: [58], expected: "LVIII" },
      { args: [1994], expected: "MCMXCIV" },
      { args: [3999], expected: "MMMCMXCIX" },
      { args: [444], expected: "CDXLIV" },
    ],
  },
  {
    id: "from-roman",
    category: "algorithms",
    difficulty: 0.4,
    fn: "fromRoman",
    signature: "fromRoman(s)",
    spec: "converts a valid standard Roman numeral string to an integer.",
    ref: `function fromRoman(s) {
  const v = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = v[s[i]], next = v[s[i + 1]] || 0;
    total += cur < next ? -cur : cur;
  }
  return total;
}`,
    tests: [
      { args: ["IX"], expected: 9 },
      { args: ["MCMXCIV"], expected: 1994 },
      { args: ["MMXXVI"], expected: 2026 },
      { args: ["CDXLIV"], expected: 444 },
    ],
  },
  {
    id: "nth-prime",
    category: "algorithms",
    difficulty: 0.4,
    fn: "nthPrime",
    signature: "nthPrime(n)",
    spec: "returns the n-th prime number, 1-indexed (nthPrime(1) = 2). It must handle n up to 10000 quickly.",
    ref: `function nthPrime(n) {
  const primes = [];
  for (let x = 2; primes.length < n; x++) {
    let ok = true;
    for (const p of primes) { if (p * p > x) break; if (x % p === 0) { ok = false; break; } }
    if (ok) primes.push(x);
  }
  return primes[n - 1];
}`,
    tests: [
      { args: [1], expected: 2 },
      { args: [6], expected: 13 },
      { args: [1000], expected: 7919 },
      { args: [10000], expected: 104729 },
    ],
  },
  {
    id: "merge-intervals",
    category: "algorithms",
    difficulty: 0.5,
    fn: "mergeIntervals",
    signature: "mergeIntervals(intervals)",
    spec: "takes an array of [start, end] pairs (unsorted) and returns the merged, non-overlapping intervals sorted by start. Intervals that touch (e.g. [1,2] and [2,3]) are merged.",
    ref: `function mergeIntervals(intervals) {
  const xs = intervals.map((x) => [x[0], x[1]]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of xs) {
    if (out.length && s <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], e);
    else out.push([s, e]);
  }
  return out;
}`,
    tests: [
      { args: [[[1, 3], [8, 10], [2, 6], [15, 18]]], expected: [[1, 6], [8, 10], [15, 18]] },
      { args: [[[1, 2], [2, 3]]], expected: [[1, 3]] },
      { args: [[]], expected: [] },
      { args: [[[5, 7], [1, 10]]], expected: [[1, 10]] },
    ],
  },
  {
    id: "spiral-order",
    category: "algorithms",
    difficulty: 0.5,
    fn: "spiralOrder",
    signature: "spiralOrder(matrix)",
    spec: "returns the elements of a rectangular 2D array in clockwise spiral order starting from the top-left corner.",
    ref: `function spiralOrder(m) {
  const out = [];
  if (!m.length) return out;
  let top = 0, bottom = m.length - 1, left = 0, right = m[0].length - 1;
  while (top <= bottom && left <= right) {
    for (let j = left; j <= right; j++) out.push(m[top][j]);
    top++;
    for (let i = top; i <= bottom; i++) out.push(m[i][right]);
    right--;
    if (top <= bottom) { for (let j = right; j >= left; j--) out.push(m[bottom][j]); bottom--; }
    if (left <= right) { for (let i = bottom; i >= top; i--) out.push(m[i][left]); left++; }
  }
  return out;
}`,
    tests: [
      { args: [[[1, 2, 3], [4, 5, 6], [7, 8, 9]]], expected: [1, 2, 3, 6, 9, 8, 7, 4, 5] },
      { args: [[[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]], expected: [1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7] },
      { args: [[[1], [2], [3]]], expected: [1, 2, 3] },
      { args: [[]], expected: [] },
    ],
  },
  {
    id: "word-freq",
    category: "algorithms",
    difficulty: 0.55,
    fn: "topWords",
    signature: "topWords(text, k)",
    spec: "lowercases text, splits it into words consisting of letters a-z and apostrophes only (every other character is a separator), and returns the k most frequent words as an array of [word, count] pairs sorted by count descending, ties broken alphabetically ascending.",
    ref: `function topWords(text, k) {
  const counts = new Map();
  for (const w of text.toLowerCase().match(/[a-z']+/g) || []) counts.set(w, (counts.get(w) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).slice(0, k);
}`,
    tests: [
      { args: ["the cat and the hat and THE bat", 2], expected: [["the", 3], ["and", 2]] },
      { args: ["b a c b a", 3], expected: [["a", 2], ["b", 2], ["c", 1]] },
      { args: ["Don't stop; don't-stop!", 1], expected: [["don't", 2]] },
      { args: ["", 2], expected: [] },
    ],
  },
  {
    id: "coin-change",
    category: "dynamic-programming",
    difficulty: 0.55,
    fn: "coinChange",
    signature: "coinChange(coins, amount)",
    spec: "returns the minimum number of coins (unlimited supply of each denomination) needed to make amount, or -1 if it cannot be made. coinChange(coins, 0) is 0.",
    ref: `function coinChange(coins, amount) {
  const dp = new Array(amount + 1).fill(Infinity);
  dp[0] = 0;
  for (let i = 1; i <= amount; i++) for (const c of coins) if (c <= i && dp[i - c] + 1 < dp[i]) dp[i] = dp[i - c] + 1;
  return dp[amount] === Infinity ? -1 : dp[amount];
}`,
    tests: [
      { args: [[1, 2, 5], 11], expected: 3 },
      { args: [[2], 3], expected: -1 },
      { args: [[1], 0], expected: 0 },
      { args: [[1, 3, 4], 6], expected: 2 },
      { args: [[186, 419, 83, 408], 6249], expected: 20 },
    ],
  },
  {
    id: "lis",
    category: "dynamic-programming",
    difficulty: 0.6,
    fn: "lisLength",
    signature: "lisLength(nums)",
    spec: "returns the length of the longest strictly increasing subsequence of an array of numbers.",
    ref: `function lisLength(nums) {
  const tails = [];
  for (const x of nums) {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] < x) lo = mid + 1; else hi = mid; }
    tails[lo] = x;
  }
  return tails.length;
}`,
    tests: [
      { args: [[10, 9, 2, 5, 3, 7, 101, 18]], expected: 4 },
      { args: [[0, 1, 0, 3, 2, 3]], expected: 4 },
      { args: [[7, 7, 7, 7]], expected: 1 },
      { args: [[]], expected: 0 },
    ],
  },
  {
    id: "edit-distance",
    category: "dynamic-programming",
    difficulty: 0.6,
    fn: "editDistance",
    signature: "editDistance(a, b)",
    spec: "returns the Levenshtein distance between strings a and b (minimum number of single-character insertions, deletions or substitutions).",
    ref: `function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}`,
    tests: [
      { args: ["kitten", "sitting"], expected: 3 },
      { args: ["", "abc"], expected: 3 },
      { args: ["flaw", "lawn"], expected: 2 },
      { args: ["same", "same"], expected: 0 },
      { args: ["intention", "execution"], expected: 5 },
    ],
  },
  {
    id: "median-two-sorted",
    category: "algorithms",
    difficulty: 0.6,
    fn: "medianOfTwo",
    signature: "medianOfTwo(a, b)",
    spec: "returns the median of the combined elements of two sorted arrays of numbers (at least one is non-empty). For an even total count, return the mean of the two middle values.",
    ref: `function medianOfTwo(a, b) {
  const m = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) m.push(j >= b.length || (i < a.length && a[i] <= b[j]) ? a[i++] : b[j++]);
  const n = m.length;
  return n % 2 ? m[(n - 1) / 2] : (m[n / 2 - 1] + m[n / 2]) / 2;
}`,
    tests: [
      { args: [[1, 3], [2]], expected: 2 },
      { args: [[1, 2], [3, 4]], expected: 2.5 },
      { args: [[], [7]], expected: 7 },
      { args: [[1, 1, 1], [5, 6, 7]], expected: 3 },
    ],
  },
  {
    id: "n-queens",
    category: "search",
    difficulty: 0.65,
    fn: "nQueens",
    signature: "nQueens(n)",
    spec: "returns the number of ways to place n non-attacking queens on an n×n chessboard. It must handle n up to 9 quickly.",
    ref: `function nQueens(n) {
  let count = 0;
  const cols = new Set(), d1 = new Set(), d2 = new Set();
  function go(r) {
    if (r === n) { count++; return; }
    for (let c = 0; c < n; c++) {
      if (cols.has(c) || d1.has(r - c) || d2.has(r + c)) continue;
      cols.add(c); d1.add(r - c); d2.add(r + c);
      go(r + 1);
      cols.delete(c); d1.delete(r - c); d2.delete(r + c);
    }
  }
  go(0);
  return count;
}`,
    tests: [
      { args: [1], expected: 1 },
      { args: [2], expected: 0 },
      { args: [4], expected: 2 },
      { args: [6], expected: 4 },
      { args: [8], expected: 92 },
      { args: [9], expected: 352 },
    ],
  },
  {
    id: "topo-sort",
    category: "search",
    difficulty: 0.7,
    fn: "topoSort",
    signature: "topoSort(n, edges)",
    spec: "given nodes 0..n-1 and directed edges [u, v] meaning u must come before v, returns the lexicographically smallest topological ordering as an array of node numbers, or an empty array if the graph has a cycle.",
    ref: `function topoSort(n, edges) {
  const indeg = new Array(n).fill(0), adj = Array.from({ length: n }, () => []);
  for (const [u, v] of edges) { adj[u].push(v); indeg[v]++; }
  const ready = [];
  for (let i = 0; i < n; i++) if (!indeg[i]) ready.push(i);
  const out = [];
  while (ready.length) {
    ready.sort((a, b) => a - b);
    const u = ready.shift();
    out.push(u);
    for (const v of adj[u]) if (--indeg[v] === 0) ready.push(v);
  }
  return out.length === n ? out : [];
}`,
    tests: [
      { args: [4, [[0, 1], [0, 2], [1, 3], [2, 3]]], expected: [0, 1, 2, 3] },
      { args: [3, [[2, 0], [1, 0]]], expected: [1, 2, 0] },
      { args: [2, [[0, 1], [1, 0]]], expected: [] },
      { args: [5, [[3, 1], [4, 1], [1, 0]]], expected: [2, 3, 4, 1, 0] },
      { args: [3, []], expected: [0, 1, 2] },
    ],
  },
  {
    id: "min-window",
    category: "strings",
    difficulty: 0.8,
    fn: "minWindow",
    signature: "minWindow(s, t)",
    spec: 'returns the shortest substring of s that contains every character of t (including duplicates), or "" if none exists. If several shortest windows exist, return the leftmost.',
    ref: `function minWindow(s, t) {
  if (!t) return "";
  const need = new Map();
  for (const c of t) need.set(c, (need.get(c) || 0) + 1);
  let missing = t.length, start = 0, bestS = 0, bestLen = Infinity;
  for (let end = 0; end < s.length; end++) {
    const c = s[end];
    if (need.has(c)) { if (need.get(c) > 0) missing--; need.set(c, need.get(c) - 1); }
    while (missing === 0) {
      if (end - start + 1 < bestLen) { bestLen = end - start + 1; bestS = start; }
      const d = s[start++];
      if (need.has(d)) { need.set(d, need.get(d) + 1); if (need.get(d) > 0) missing++; }
    }
  }
  return bestLen === Infinity ? "" : s.slice(bestS, bestS + bestLen);
}`,
    tests: [
      { args: ["ADOBECODEBANC", "ABC"], expected: "BANC" },
      { args: ["a", "aa"], expected: "" },
      { args: ["a", "a"], expected: "a" },
      { args: ["aaflslflsldkalskaaa", "aaa"], expected: "aaa" },
      { args: ["abcabdebac", "cda"], expected: "cabd" },
    ],
  },
  {
    id: "eval-expr",
    category: "parsing",
    difficulty: 0.8,
    fn: "evalExpr",
    signature: "evalExpr(s)",
    spec: "evaluates an integer arithmetic expression string containing non-negative integer literals, + - * /, parentheses, unary minus and spaces, with the usual precedence and left associativity. Division truncates toward zero. eval and Function are not available.",
    ref: `function evalExpr(s) {
  let i = 0;
  const peek = () => { while (s[i] === " ") i++; return s[i]; };
  function expr() {
    let v = term();
    for (let c = peek(); c === "+" || c === "-"; c = peek()) { i++; const r = term(); v = c === "+" ? v + r : v - r; }
    return v;
  }
  function term() {
    let v = factor();
    for (let c = peek(); c === "*" || c === "/"; c = peek()) { i++; const r = factor(); v = c === "*" ? v * r : Math.trunc(v / r); }
    return v;
  }
  function factor() {
    const c = peek();
    if (c === "-") { i++; return -factor(); }
    if (c === "(") { i++; const v = expr(); peek(); i++; return v; }
    let n = 0;
    while (s[i] >= "0" && s[i] <= "9") n = n * 10 + (s.charCodeAt(i++) - 48);
    return n;
  }
  return expr();
}`,
    tests: [
      { args: ["1 + 2 * 3"], expected: 7 },
      { args: ["(1+2)*3"], expected: 9 },
      { args: ["10 / 3"], expected: 3 },
      { args: ["-7 / 2"], expected: -3 },
      { args: ["2*(3+(4-1))*-1"], expected: -12 },
      { args: ["7 - -2"], expected: 9 },
      { args: ["100 - 10 - 1"], expected: 89 },
    ],
  },
];

export const CODE_TASKS = TASKS;

export const codeSuite: BenchSuite = {
  id: SUITE,
  name: "Code",
  description:
    "Write a JavaScript function; graded by executing it against hidden unit tests in an isolated node:vm sandbox (no require/process, 1 s per call). From one-liners to parsers and dynamic programming.",
  tasks: TASKS.map(
    (t): TaskInput => ({
      id: t.id,
      category: t.category,
      difficulty: t.difficulty,
      prompt: `Write a JavaScript function \`${t.signature}\` that ${t.spec}\n\n${FORMAT.code(t.fn)}`,
      expected: t.ref,
      grader: { kind: "code", language: "javascript", functionName: t.fn, tests: t.tests },
    }),
  ).map((t) => makeTask(SUITE, t)),
};
