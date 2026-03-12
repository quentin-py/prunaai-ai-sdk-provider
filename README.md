# BFL x Pruna

## Installation instructions

All our code is run on a single H200 SXM node.

First, you need to set your NGC key:

```bash
mkdir -p ~/.config/enroot
cat > ~/.config/enroot/.credentials << 'EOF'
machine nvcr.io login $oauthtoken password <YOUR_NGC_API_KEY>
EOF
chmod 600 ~/.config/enroot/.credentials
```

In case you use SLURM, pull a node using the following command:

```bash
export DATA_PATH=<YOUR_DATA_PATH>
export CODE_PATH=<PATH_TO_THIS_REPO>
srun -N1 --gpus=8 --cpus-per-task=128 --mem=0 --pty \
  --container-image='nvcr.io#nvidia/pytorch:25.11-py3' \
  --container-mounts=${DATA_PATH}:/data,${CODE_PATH}:/code \
  bash
cd /code
pip install -r pruna_requirements.txt
```

## Sampling instructions

To test sampling, run

```bash
cd /code
export PYTHONPATH=src
export FLUX2_MODEL_PATH=<PATH_TO_FLEX_MODEL>
export AE_MODEL_PATH=<PATH_TO_AUTOENCODER>
python scripts/cli.py --model_name "flux.2-flex"
```

## Troughput / speed benchmark instructions

The test will check the speed using 1, 2, 4, and 8 GPUs.

```bash
cd /code
export PYTHONPATH=src
export FLUX2_MODEL_PATH=<PATH_TO_FLEX_MODEL>
export AE_MODEL_PATH=<PATH_TO_AUTOENCODER>
bash scripts/speed_test_h200.sh
```

You should see the following results:

| GPUs | Compiled | Mode | Output Size | Input Size | Seconds/Image |
|------|----------|------|-------------|------------|---------------|
| 1    | Yes      | t2i  | 1024x1024   | -          |        48.53 |
| 2    | Yes      | t2i  | 1024x1024   | -          |        26.97 |
| 4    | Yes      | t2i  | 1024x1024   | -          |        15.02 |
| 8    | Yes      | t2i  | 1024x1024   | -          |         9.05 |
| 1    | Yes      | i2i  | 1024x1024   | 1024x1024  |       104.79 |
| 2    | Yes      | i2i  | 1024x1024   | 1024x1024  |        57.41 |
| 4    | Yes      | i2i  | 1024x1024   | 1024x1024  |        31.40 |
| 8    | Yes      | i2i  | 1024x1024   | 1024x1024  |        18.48 |