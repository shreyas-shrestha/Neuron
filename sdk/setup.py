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
    },
    description="Neuron model behavior monitoring SDK",
)
