# Install the trained pest model here

After running `training/train_pest_model.ipynb`, unzip `pest_model.zip` and place
its contents in this folder:

```
public/models/pest/model.json
public/models/pest/group1-shard1of*.bin   (one or more shard files)
public/models/pest/labels.json
```

Then redeploy and choose **Settings → Object model → "Pest model · YOLOv8"** in
the app. Until these files exist, that option fails gracefully and the app stays
on COCO-SSD.
