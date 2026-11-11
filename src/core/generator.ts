export function generateUrls(config: {
  pattern: string;
  from: number;
  to: number;
  step: number;
}): string[] {
  if (!config.pattern.includes("{num}"))
    throw new Error("Шаблон повинен містити {num}");
  if (
    ![config.from, config.to, config.step].every(Number.isSafeInteger) ||
    config.step < 1 ||
    config.to < config.from
  )
    throw new Error("Некоректний діапазон або крок");
  const count = Math.floor((config.to - config.from) / config.step) + 1;
  if (count > 10000) throw new Error("Не більше 10000 посилань за раз");
  return Array.from({ length: count }, (_, i) => {
    const url = new URL(
      config.pattern.replaceAll("{num}", String(config.from + i * config.step)),
    );
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("Лише HTTP(S) без облікових даних");
    return url.href;
  });
}
