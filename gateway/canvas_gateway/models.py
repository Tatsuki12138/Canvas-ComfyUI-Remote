from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator


class PairRequest(BaseModel):
    code: str = Field(min_length=8, max_length=8)


class FavoriteCreateRequest(BaseModel):
    job_id: str = Field(min_length=1, max_length=80)
    index: int = Field(default=0, ge=0, le=200)


class LoraRequest(BaseModel):
    name: str = Field(min_length=1, max_length=260)
    weight: float = Field(default=1.0, ge=0.0, le=2.0)
    text_encoder_weight: float | None = Field(default=None, ge=0.0, le=2.0)


class GenerateRequest(BaseModel):
    workflow_id: str | None = Field(default=None, max_length=80)
    prompt: str = Field(min_length=1, max_length=6000)
    negative_prompt: str = Field(default="", max_length=3000)
    checkpoint: str | None = Field(default=None, max_length=260)
    width: int = Field(default=1024, ge=512, le=2048)
    height: int = Field(default=1024, ge=512, le=2048)
    steps: int = Field(default=28, ge=1, le=100)
    cfg: float = Field(default=6.0, ge=0.0, le=30.0)
    sampler_name: str | None = Field(default=None, max_length=80)
    scheduler: str | None = Field(default=None, max_length=80)
    hires_steps: int | None = Field(default=None, ge=1, le=100)
    hires_cfg: float | None = Field(default=None, ge=0.0, le=30.0)
    hires_denoise: float | None = Field(default=None, ge=0.0, le=1.0)
    hires_sampler_name: str | None = Field(default=None, max_length=80)
    hires_scheduler: str | None = Field(default=None, max_length=80)
    hires_kernel_size: int | None = Field(default=None, ge=1, le=8)
    seed: int = Field(default=-1, ge=-1, le=9_223_372_036_854_775_807)
    loras: list[LoraRequest] | None = None

    @field_validator("width", "height")
    @classmethod
    def divisible_by_64(cls, value: int) -> int:
        if value % 64:
            raise ValueError("尺寸必须是 64 的倍数")
        return value


class TagNormalizeRequest(BaseModel):
    text: str = Field(default="", max_length=20000)


class TagInterrogateRequest(BaseModel):
    image: str = Field(min_length=1, max_length=20_000_000)
    filename: str = Field(default="canvas-wd14.png", max_length=200)
    threshold: float = Field(default=0.35, ge=0.0, le=1.0)


class ExternalGenerateRequest(BaseModel):
    workflow_id: str | None = Field(default=None, max_length=80)
    prompt: str = Field(min_length=1, max_length=6000)
    negative_prompt: str = Field(default="", max_length=3000)
    checkpoint: str | None = Field(default=None, max_length=260)
    width: int = Field(default=1024, ge=512, le=2048)
    height: int = Field(default=1024, ge=512, le=2048)
    steps: int = Field(default=28, ge=1, le=100)
    cfg: float = Field(default=6.0, ge=0.0, le=30.0)
    sampler_name: str | None = Field(default=None, max_length=80)
    scheduler: str | None = Field(default=None, max_length=80)
    hires_steps: int | None = Field(default=None, ge=1, le=100)
    hires_cfg: float | None = Field(default=None, ge=0.0, le=30.0)
    hires_denoise: float | None = Field(default=None, ge=0.0, le=1.0)
    hires_sampler_name: str | None = Field(default=None, max_length=80)
    hires_scheduler: str | None = Field(default=None, max_length=80)
    hires_kernel_size: int | None = Field(default=None, ge=1, le=8)
    seed: int = Field(default=-1, ge=-1, le=9_223_372_036_854_775_807)
    loras: list[LoraRequest] | None = None

    @field_validator("width", "height")
    @classmethod
    def divisible_by_64(cls, value: int) -> int:
        if value % 64:
            raise ValueError("尺寸必须是 64 的倍数")
        return value
