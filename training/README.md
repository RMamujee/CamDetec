# Training the CamDetec pest model

COCO-SSD (the default detector) recognizes ~80 general classes but **not**
rodents or insects. This directory trains a purpose-built pest detector that
drops into the app through the `Detector` seam (`lib/detector.ts` →
`YoloTfjsDetector`) with **no app code changes** — you just install the exported
model under `public/models/pest/` and pick it in Settings.

## TL;DR — it's free

Open **`train_pest_model.ipynb`** in **Google Colab** (or Kaggle) with a free GPU
and Run all. The only manual input is a free Roboflow API key to pull a labeled
dataset. Output is a `pest_model.zip` you unzip into `public/models/pest/`.

- **Compute:** free Colab T4 / Kaggle GPU (~20–60 min for nano).
- **Data:** free public datasets on Roboflow Universe / iNaturalist.
- **Serving:** $0 — the model runs in-browser, it's just static files on Vercel.

## Why YOLOv8 (not the TF Object Detection API)

Ultralytics YOLOv8 is the most reliable "just run it" path in a free notebook:
one-line install, one-line train, first-class `export(format="tfjs")`, and tight
Roboflow integration. `yolov8n` (nano) is small enough to run in the browser via
TF.js — the same class of model as COCO-SSD. The app's `YoloTfjsDetector` decodes
the raw YOLOv8 head ([1, 4+nc, 8400]) and runs NMS client-side.

## Target classes (v1)

Start narrow — the pests that drive most trap decisions — then expand:

```
rat, mouse, cockroach   # then: raccoon, opossum, squirrel, bird
```

`labels.json` is written automatically by the notebook from your dataset's
`data.yaml` names (class order must match the model). `labels.example.json` shows
the shape.

## Install the result

The notebook ends with exact steps. In short:

1. Unzip `pest_model.zip` → `model.json`, `group1-shard*.bin`, `labels.json`.
2. Copy all into `public/models/pest/`.
3. `vercel --prod` (or commit + push).
4. App → **Settings → Object model → "Pest model · YOLOv8"**.

If the model isn't installed, selecting it fails gracefully and the app stays on
COCO-SSD (motion detection still flags off-vocabulary pests by movement).

## Files

- `train_pest_model.ipynb` — the training + export notebook (Colab / Kaggle).
- `labels.example.json` — label-order example (YOLO: no background class).
- `requirements.txt` — deps if you'd rather run it locally with a GPU.
