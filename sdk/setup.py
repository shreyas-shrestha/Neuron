from setuptools import setup

setup(
    name="neuron-sdk",
    version="0.1.0",
    py_modules=["neuron_sdk", "neuron"],
    install_requires=["requests", "torch"],
    extras_require={
        "activations": [
            "transformer-lens>=2.0.0",
        ],
        "demo": [
            "transformer-lens>=2.0.0",
            "transformers>=4.44.0",
            "datasets>=2.14.0",
            "accelerate>=0.25.0",
        ],
    },
    description="Neuron model behavior monitoring SDK",
)
