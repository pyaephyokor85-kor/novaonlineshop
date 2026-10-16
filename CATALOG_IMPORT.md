# NOVA Catalog Import — Official Source: Google Sheet / Excel

## Source-of-truth decision

**Option A is active.** The Google Sheet/Excel catalog and the customer-supplied NV-003 YSL Y brief are the official source for product identity, names, codes, scent types, brands, descriptions and prices. `Final32pcs.html` is used only as a visual/image source; its alternate reference names do not override the official Google Sheet/Excel names.

The uploaded NOVA files are now merged into the app catalog:

- `CopyofNOVA_Original_Reference_Brand_List(1).xlsx` supplies the 32 product records, reference fragrance, brand, category and scent type.
- `NOVA_x5f_32_x5f_Scents_x5f_Content_x5f_Plan.xlsx` supplies Myanmar bio copy, TikTok captions and Facebook long posts.
- `NOVA_Scent_Code_and_Name_List(1).gsheet` was used as a consistency reference for code/name/category and customer scent-vibe descriptions.

The resulting catalog is stored in `data/nova-catalog.json` for the Node API and `data/nova-catalog.ts` for the Expo app. Home and Discover now use all 32 scents. Product detail shows the imported Myanmar bio, category, brand, official original reference and product image. The AI Advisor uses the imported scent families, names, references and descriptions when ranking and explaining recommendations.

`NV-003 — Y Signature (EDP)` was initially missing from the Content Plan workbook and has now been completed from the customer-provided product brief. Its YSL Y reference, Fresh/Aromatic/Woody (Aromatic Fougère) classification, Apple/Ginger/Sage/Amberwood notes, Myanmar bio, TikTok caption, Facebook post and 10ml/30ml prices are now included.

`Final32pcs.html` contributes 32 embedded JPG product visuals, extracted to `assets/products/NV-001.jpg` through `NV-032.jpg` and mapped by code order. Only prices explicitly supplied in the official data/brief are shown; NV-003 displays `10ml 15,000 Ks · 30ml 35,000 Ks`, while other products remain `—` until official prices are supplied.
