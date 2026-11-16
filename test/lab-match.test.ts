import { describe, expect, test } from "bun:test";

import { parseLabMatch, readResult } from "../src/modules/labs/lab-match";

describe("lab match request", () => {
  test("needs text or a photo, trims text, and keeps only catalog keys", () => {
    expect(() => parseLabMatch({})).toThrow("Tulis alatnya atau kirim fotonya.");
    const input = parseLabMatch({ text: "  meriam  ", keys: ["gerak-parabola", "bukan-lab"] });
    expect(input.text).toBe("meriam");
    expect(input.keys).toEqual(["gerak-parabola"]);
    expect(parseLabMatch({ text: "x" }).keys).toHaveLength(4);
  });

  test("refuses an image that is not JPEG, PNG or WebP, or too big", () => {
    expect(() => parseLabMatch({ image: { mimeType: "image/gif", data: "AAAA" } })).toThrow("JPEG, PNG, atau WebP");
    expect(() => parseLabMatch({ image: { mimeType: "image/jpeg", data: "A".repeat(2_100_000) } })).toThrow("terlalu besar");
    expect(parseLabMatch({ image: { mimeType: "image/jpeg", data: "AAAA" } }).image?.mimeType).toBe("image/jpeg");
  });
});

describe("lab match answer", () => {
  test("drops unknown, unoffered and repeated labs, and keeps three at most", () => {
    const text = JSON.stringify({
      seen: "  meriam kardus ",
      matches: [
        { key: "gerak-parabola", reason: "Meriam menembakkan bola." },
        { key: "gerak-parabola", reason: "lagi" },
        { key: "bukan-lab", reason: "x" },
        { key: "mesin-gelombang", reason: "y" },
        { key: "reaktor-tumbukan", reason: "z" },
        { key: "mikroskop-osmosis", reason: "w" },
      ],
    });
    const result = readResult(text, ["gerak-parabola", "mesin-gelombang", "reaktor-tumbukan", "mikroskop-osmosis"]);
    expect(result.seen).toBe("meriam kardus");
    expect(result.matches.map((match) => match.key)).toEqual(["gerak-parabola", "mesin-gelombang", "reaktor-tumbukan"]);
    expect(readResult(text, ["mesin-gelombang"]).matches).toEqual([{ key: "mesin-gelombang", reason: "y" }]);
  });

  test("an empty answer means no lab fits; a broken one is an outage", () => {
    expect(readResult(JSON.stringify({ seen: "kincir angin", matches: [] }), ["gerak-parabola"]).matches).toEqual([]);
    expect(() => readResult("{oops", ["gerak-parabola"])).toThrow("tidak tersedia");
  });
});
