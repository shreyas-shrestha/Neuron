from setuptools import setup

setup(
    name="neuron-sdk",
    version="0.1.0",
    py_modules=["neuron_sdk", "neuron"],
    install_requires=["requests", "torch"],
    description="Neuron model behavior monitoring SDK",
)
