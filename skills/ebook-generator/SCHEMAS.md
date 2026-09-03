# ebook-generator - Artifact Schemas

Every stage of the pipeline reads and writes one of these. Field names are fixed: the renderer, the
exporter, and the single-page regeneration command all key off them.

Working directory layout:

```
book/
  story.json
  characters.json
  scenes.json
  pages.json
  prompts.json
  characters/   fox-turnaround.png
  scenes/       vineyard-plate.png
  images/       p01.png p02.png ... p12.png
  book.html
  book.pdf
  book.epub
```

---

## story.json

```json
{
  "title": "The Fox and the Grapes",
  "language": "en",
  "age_band": "6-8",
  "story_type": "fable",
  "moral": "Wanting something you cannot reach does not make it worthless, and pretending otherwise fools nobody.",
  "page_count": 12,
  "cast": [
    { "id": "fox", "name": "Rusty", "role": "protagonist", "want": "to eat the grapes" },
    { "id": "beetle", "name": "Pim", "role": "witness", "want": "to watch, and to be honest about it" }
  ],
  "locations": [
    { "id": "vineyard", "name": "the hillside vineyard" },
    { "id": "path", "name": "the dusty path home" }
  ],
  "beats": [
    {
      "act": "setup",
      "summary": "Rusty crests the hill and sees the vineyard for the first time.",
      "copy": "Rusty came over the hill and stopped. Above him, hanging in the warm afternoon, were the roundest purple grapes he had ever seen."
    }
  ]
}
```

- `language` - BCP 47. The copy is written natively in this language.
- `age_band` - `"3-5"` | `"6-8"` | `"9-12"`.
- `beats[].act` - `"setup"` | `"attempt"` | `"turn"` | `"resolution"`.
- `beats[].copy` - the final book text, already at the age band's word count.

**Validation**: every `cast[].id` and `locations[].id` referenced downstream must exist here.

---

## characters.json

```json
{
  "style_lock": "children's picture book illustration, soft gouache and coloured-pencil texture, warm saturated palette, gentle visible brush grain, clean rounded shapes, soft ambient light, no harsh outlines, storybook composition, consistent flat depth of field",
  "aspect": "4:3",
  "characters": [
    {
      "id": "fox",
      "name": "Rusty",
      "token": "young red fox, small round-bodied cub proportions with an oversized head, rust-orange fur #C8622F, cream muzzle chest and tail tip #F2E3CE, four dark brown socks #3B2A22, round amber eyes #E8A33D with large pupils, small black button nose, moss-green knitted scarf #6B8F5E knotted at the neck, always leaning forward on tiptoe with tail held high and curved",
      "invariants": [
        "moss-green scarf, always worn, never another colour",
        "cream tail tip",
        "four dark brown socks"
      ],
      "expressions": {
        "hopeful": "eyes wide, ears forward, mouth slightly open",
        "straining": "eyes squeezed shut, ears flat back, teeth showing",
        "deflated": "ears down and out, eyelids low, tail dropped",
        "resolved": "eyes calm and level, ears neutral, small closed smile"
      },
      "turnaround": "characters/fox-turnaround.png"
    }
  ]
}
```

- `style_lock` - written once, prepended byte-identical to every prompt in the book.
- `token` - 25-45 words. Species and build, colour with hex, face, costume and props, posture.
  Pasted **verbatim** into prompts. Never edited mid-book.
- `invariants` - each one is also appended to the negative prompt as "no missing X" / "no changed X".
- `expressions` - a small fixed vocabulary, so page prompts pick from a list instead of inventing
  new face descriptions that drift.

---

## scenes.json

```json
{
  "scenes": [
    {
      "id": "vineyard",
      "token": "a sun-drenched hillside vineyard, low dry-stone wall running along the left, a leaning wooden trellis heavy with deep-purple grapes #5B3A6B, one cracked terracotta pot at its foot, rolling green hills #7FA05C in the far background",
      "palette": ["#7FA05C", "#5B3A6B", "#D9C08A", "#8C6B4A"],
      "lighting_variants": {
        "afternoon": "late golden afternoon, long warm shadows falling to the right",
        "dusk": "low amber light, cooling blue shadows, sky going lilac"
      },
      "depth": {
        "foreground": "grass tufts and the cracked pot",
        "midground": "the trellis and the fox",
        "background": "stone wall and rolling hills"
      },
      "plate": "scenes/vineyard-plate.png"
    }
  ]
}
```

- `lighting_variants` - named, and each page declares which one it uses. Prevents random time jumps.
- `depth` - keeps repeat shots of the same location reading as the same location.

---

## pages.json

```json
{
  "pages": [
    {
      "id": "p01",
      "role": "cover",
      "copy": "The Fox and the Grapes",
      "location": "vineyard",
      "lighting": "afternoon",
      "characters": ["fox"],
      "beat": "invitation",
      "camera": "medium, slightly low angle, fox looking up out of frame toward the grapes",
      "text_zone": "top",
      "notes": "Title sits in open sky. Most appealing pose in the book."
    },
    {
      "id": "p06",
      "role": "escalation",
      "copy": "He backed up. He ran. He jumped so high that for one whole second he was flying.",
      "location": "vineyard",
      "lighting": "afternoon",
      "characters": ["fox", "beetle"],
      "beat": "peak effort, comic",
      "camera": "wide, worm's-eye from ground level, fox mid-air against the sky",
      "text_zone": "bottom",
      "notes": "Biggest, most dynamic image in the book."
    }
  ]
}
```

- `id` - `p01`..`pNN`, zero-padded. Drives every filename.
- `text_zone` - `top` | `bottom` | `left` | `right` | `facing` | `full-bleed-none`.
- `camera` - across the book: five or more distinct setups, never the same one three pages running.

---

## prompts.json

```json
{
  "model": "your image model id",
  "aspect": "4:3",
  "negative_base": "no text, no letters, no words, no watermark, no signature, no speech bubbles, no page numbers, no frame or border, no collage, no multiple panels, no photorealism, no 3D render, no extra limbs, no extra characters",
  "prompts": [
    {
      "id": "p06",
      "seed": 774213,
      "prompt": "children's picture book illustration, soft gouache and coloured-pencil texture, warm saturated palette, gentle visible brush grain, clean rounded shapes, soft ambient light, no harsh outlines, storybook composition, consistent flat depth of field. A sun-drenched hillside vineyard, low dry-stone wall running along the left, a leaning wooden trellis heavy with deep-purple grapes #5B3A6B, one cracked terracotta pot at its foot, rolling green hills #7FA05C in the far background. Late golden afternoon, long warm shadows falling to the right. Young red fox, small round-bodied cub proportions with an oversized head, rust-orange fur #C8622F, cream muzzle chest and tail tip #F2E3CE, four dark brown socks #3B2A22, round amber eyes #E8A33D with large pupils, small black button nose, moss-green knitted scarf #6B8F5E knotted at the neck, always leaning forward on tiptoe with tail held high and curved. He is caught at the top of an enormous leap, all four legs stretched out, front paws reaching for the grapes. Straining: eyes squeezed shut, ears flat back, teeth showing. Wide shot, worm's-eye view from ground level, the fox mid-air against open sky. Leave the lower third as plain sunlit grass with no detail, for text overlay. 4:3 landscape.",
      "negative": "no text, no letters, no words, no watermark, no signature, no speech bubbles, no page numbers, no frame or border, no collage, no multiple panels, no photorealism, no 3D render, no extra limbs, no extra characters, no changed fur colour, no missing moss-green scarf, no missing cream tail tip",
      "output": "images/p06.png",
      "status": "approved"
    }
  ]
}
```

- Slot order in `prompt` is fixed: style lock, scene, lighting, character token(s), action,
  expression, camera, composition and text safe zone, aspect.
- `negative` = `negative_base` plus every character invariant on this page.
- `seed` - record it. It is what makes a later single-page regeneration reproducible.
- `status` - `pending` | `generated` | `approved` | `rejected`. Only `approved` pages render.

---

## Single-page regeneration

1. Edit only that page's entry in `pages.json` (or nothing, if the image was just a bad roll).
2. Rebuild only that entry in `prompts.json`, keeping every token byte-identical.
3. Generate to the same `images/pNN.png` path, with a new seed.
4. Run the stage 8 QC gate against the turnaround and the plate.
5. Re-render and re-export. Nothing else in the book changes.
