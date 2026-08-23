from typing import Literal

from pydantic import BaseModel, ConfigDict


class DeleteAccountRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    confirmation: Literal["DELETE"]
