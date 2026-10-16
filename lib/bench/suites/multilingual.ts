import type { BenchSuite } from "../types";
import { makeTask, type TaskInput } from "./util";

const SUITE = "multilingual";

/**
 * The same kind of short arithmetic word problem written in eight languages, so the
 * report can slice accuracy, cost and the chosen model by language. Answers are numbers,
 * graded exactly; every prompt asks for a final `Answer: <number>` line in Western digits.
 */

const FORMAT_BY_LANG: Record<string, string> = {
  es: "Termina tu respuesta con una línea final de la forma `Answer: <número>` (solo el número, con dígitos 0-9).",
  fr: "Termine ta réponse par une dernière ligne de la forme `Answer: <nombre>` (seulement le nombre, en chiffres 0-9).",
  de: "Beende deine Antwort mit einer letzten Zeile der Form `Answer: <Zahl>` (nur die Zahl, mit den Ziffern 0-9).",
  pt: "Termine sua resposta com uma linha final no formato `Answer: <número>` (apenas o número, com dígitos 0-9).",
  ja: "最後の行を `Answer: <数字>` の形式にしてください（数字のみ、0-9の半角数字で）。",
  zh: "请在回答的最后一行写成 `Answer: <数字>` 的形式（只写数字，使用0-9的阿拉伯数字）。",
  hi: "अपने उत्तर की अंतिम पंक्ति `Answer: <संख्या>` के रूप में लिखें (केवल संख्या, अंक 0-9 में)।",
  ar: "اختم إجابتك بسطر أخير بالشكل `Answer: <رقم>` (الرقم فقط، بالأرقام 0-9).",
};

const LANG_NAME: Record<string, string> = {
  es: "spanish",
  fr: "french",
  de: "german",
  pt: "portuguese",
  ja: "japanese",
  zh: "chinese",
  hi: "hindi",
  ar: "arabic",
};

const PROBLEMS: { id: string; lang: string; difficulty: number; prompt: string; expected: string }[] = [
  { id: "es-apples", lang: "es", difficulty: 0.1, prompt: "María tiene 12 manzanas y regala 5. ¿Cuántas manzanas le quedan?", expected: "7" },
  { id: "es-train", lang: "es", difficulty: 0.3, prompt: "Un tren sale a las 9:00 y viaja durante 3 horas y 45 minutos. ¿Cuántos minutos dura el viaje en total?", expected: "225" },
  { id: "es-change", lang: "es", difficulty: 0.35, prompt: "Una tienda vende cuadernos a 4 euros cada uno. Si compras 3 cuadernos y pagas con un billete de 20 euros, ¿cuántos euros de cambio recibes?", expected: "8" },
  { id: "es-ages", lang: "es", difficulty: 0.65, prompt: "La edad de Laura es el triple de la edad de su hijo. Dentro de 12 años, la edad de Laura será el doble de la de su hijo. ¿Cuántos años tiene Laura ahora?", expected: "36" },
  { id: "fr-marbles", lang: "fr", difficulty: 0.1, prompt: "Paul a 15 billes. Il en perd 6. Combien de billes lui reste-t-il ?", expected: "9" },
  { id: "fr-area", lang: "fr", difficulty: 0.25, prompt: "Un rectangle mesure 8 cm de long et 5 cm de large. Quelle est son aire en centimètres carrés ?", expected: "40" },
  { id: "fr-bill", lang: "fr", difficulty: 0.35, prompt: "Trois amis partagent équitablement une addition de 84 euros. Combien d'euros chacun paie-t-il ?", expected: "28" },
  { id: "de-sweets", lang: "de", difficulty: 0.1, prompt: "Anna hat 20 Bonbons und isst 7 davon. Wie viele Bonbons hat sie noch?", expected: "13" },
  { id: "de-speed", lang: "de", difficulty: 0.3, prompt: "Ein Auto fährt 60 Kilometer pro Stunde. Wie viele Kilometer fährt es in 2,5 Stunden?", expected: "150" },
  { id: "de-weekday", lang: "de", difficulty: 0.45, prompt: "Heute ist Montag. Welcher Wochentag ist in 10 Tagen? Gib die Nummer des Wochentags an, wobei Montag = 1 und Sonntag = 7 ist.", expected: "4" },
  { id: "de-crates", lang: "de", difficulty: 0.6, prompt: "Ein Händler kauft 12 Kisten mit je 15 Äpfeln. 18 Äpfel sind verdorben. Den Rest verkauft er in Tüten zu je 6 Äpfeln. Wie viele Tüten kann er füllen?", expected: "27" },
  { id: "pt-cookies", lang: "pt", difficulty: 0.15, prompt: "João comprou 4 pacotes com 6 biscoitos cada. Quantos biscoitos ele tem ao todo?", expected: "24" },
  { id: "pt-book", lang: "pt", difficulty: 0.35, prompt: "Um livro tem 240 páginas. Ana já leu um quarto do livro. Quantas páginas ela ainda precisa ler?", expected: "180" },
  { id: "ja-apples", lang: "ja", difficulty: 0.1, prompt: "りんごが8個あります。3個食べました。りんごは何個残っていますか？", expected: "5" },
  { id: "ja-change", lang: "ja", difficulty: 0.35, prompt: "1本120円のペンを5本買いました。1000円札で払うと、おつりは何円ですか？", expected: "400" },
  { id: "ja-equation", lang: "ja", difficulty: 0.55, prompt: "ある数に7を足して、それを3倍すると45になります。ある数はいくつですか？", expected: "8" },
  { id: "zh-books", lang: "zh", difficulty: 0.1, prompt: "小明有10本书，又买了6本。他现在一共有多少本书？", expected: "16" },
  { id: "zh-percent", lang: "zh", difficulty: 0.35, prompt: "一个班有40名学生，其中女生占百分之四十五。这个班有多少名女生？", expected: "18" },
  { id: "zh-square", lang: "zh", difficulty: 0.5, prompt: "一个正方形的周长是36厘米。它的面积是多少平方厘米？", expected: "81" },
  { id: "hi-pen", lang: "hi", difficulty: 0.15, prompt: "राम के पास 25 रुपये हैं। वह 9 रुपये की एक कलम खरीदता है। उसके पास कितने रुपये बचे?", expected: "16" },
  { id: "hi-bus", lang: "hi", difficulty: 0.3, prompt: "एक बस में 32 यात्री थे। पहले स्टॉप पर 11 यात्री उतरे और 7 यात्री चढ़े। अब बस में कितने यात्री हैं?", expected: "28" },
  { id: "ar-pens", lang: "ar", difficulty: 0.15, prompt: "لدى سارة 14 قلمًا، وأعطت أختها 5 أقلام. كم قلمًا بقي لديها؟", expected: "9" },
  { id: "ar-perimeter", lang: "ar", difficulty: 0.35, prompt: "مستطيل طوله 12 مترًا وعرضه 7 أمتار. ما محيطه بالأمتار؟", expected: "38" },
];

const TASKS: TaskInput[] = PROBLEMS.map((p) => ({
  id: p.id,
  category: LANG_NAME[p.lang],
  difficulty: p.difficulty,
  prompt: `${p.prompt}\n\n${FORMAT_BY_LANG[p.lang]}`,
  expected: p.expected,
  grader: { kind: "numeric" },
  tags: [`lang:${p.lang}`],
}));

export const multilingualSuite: BenchSuite = {
  id: SUITE,
  name: "Other languages",
  description:
    "Short arithmetic word problems in Spanish, French, German, Portuguese, Japanese, Chinese, Hindi and Arabic. Shows whether a router routes non-English prompts differently, and whether accuracy holds up.",
  optional: true,
  tasks: TASKS.map((t) => makeTask(SUITE, t)),
};
