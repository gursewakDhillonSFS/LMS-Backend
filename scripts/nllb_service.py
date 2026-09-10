"""
Skillora NLLB-200 Self-Hosted Translation Microservice
======================================================
Optional local microservice providing Meta AI NLLB-200 model inference
(facebook/nllb-200-distilled-600M) for English, Punjabi, and French.

Requirements:
    pip install -r scripts/requirements.txt
    (or: pip install fastapi uvicorn transformers torch sentencepiece pydantic)

Run:
    python3 scripts/nllb_service.py
    # Runs on http://localhost:5005

NOTE: The LMS backend does NOT require this script to run. If this service
is not active, the backend automatically uses the built-in free open-source
translation provider.
"""

import importlib
import sys
from typing import Any, List, Optional

def _safe_import(name: str) -> Any:
    try:
        return importlib.import_module(name)
    except Exception:
        return None

_pydantic = _safe_import("pydantic")
_fastapi = _safe_import("fastapi")
_uvicorn = _safe_import("uvicorn")
_transformers = _safe_import("transformers")
_torch = _safe_import("torch")

DEPENDENCIES_AVAILABLE = all(
    mod is not None
    for mod in (_pydantic, _fastapi, _uvicorn, _transformers, _torch)
)

class HTTPException(Exception):
    """Fallback HTTPException compatible with FastAPI signature."""
    def __init__(self, status_code: int = 500, detail: Any = None, **kwargs: Any) -> None:
        super().__init__(str(detail) if detail else f"HTTP error {status_code}")
        self.status_code = status_code
        self.detail = detail

if _fastapi is not None:
    FastAPI = getattr(_fastapi, "FastAPI", None)
    HTTPException = getattr(_fastapi, "HTTPException", HTTPException)
else:
    FastAPI = None

if _pydantic is not None:
    BaseModel = getattr(_pydantic, "BaseModel", object)
else:
    class BaseModel:  # type: ignore
        def __init__(self, **kwargs: Any) -> None:
            for k, v in kwargs.items():
                setattr(self, k, v)

AutoTokenizer = getattr(_transformers, "AutoTokenizer", None) if _transformers else None
AutoModelForSeq2SeqLM = getattr(_transformers, "AutoModelForSeq2SeqLM", None) if _transformers else None
torch = _torch
uvicorn = _uvicorn

MODEL_NAME = "facebook/nllb-200-distilled-600M"
PORT = 5005


def create_app():
    if not DEPENDENCIES_AVAILABLE:
        print("=" * 60)
        print("Skillora NLLB-200 Microservice")
        print("=" * 60)
        print("Optional dependencies are not installed in this Python environment.")
        print("To run local NLLB-200 inference, please run:")
        print("    pip install -r scripts/requirements.txt")
        print()
        print("Note: The LMS application runs automatically without this service")
        print("using the built-in FreeOpenSourceProvider.")
        print("=" * 60)
        sys.exit(0)

    app = FastAPI(title="Skillora NLLB-200 Translation Service", version="1.0.0")

    print(f"Loading {MODEL_NAME}...")
    device = (
        "cuda"
        if torch.cuda.is_available()
        else ("mps" if torch.backends.mps.is_available() else "cpu")
    )
    print(f"Using device: {device}")

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME).to(device)
    model.eval()
    print("Model loaded successfully!")

    class TranslateRequest(BaseModel):
        text: str
        source_lang: Optional[str] = "eng_Latn"
        target_lang: str

    class TranslateResponse(BaseModel):
        translated_text: str
        source_lang: str
        target_lang: str

    class BatchTranslateRequest(BaseModel):
        texts: List[str]
        source_lang: Optional[str] = "eng_Latn"
        target_lang: str

    class BatchTranslateResponse(BaseModel):
        translations: List[str]
        source_lang: str
        target_lang: str

    @app.get("/health")
    def health():
        return {
            "status": "ok",
            "model": MODEL_NAME,
            "device": device,
            "supported_languages": ["eng_Latn", "pan_Guru", "fra_Latn"],
        }

    @app.post("/translate", response_model=TranslateResponse)
    def translate(req: TranslateRequest):
        if not req.text or not req.text.strip():
            return TranslateResponse(
                translated_text=req.text,
                source_lang=req.source_lang,
                target_lang=req.target_lang,
            )

        try:
            tokenizer.src_lang = req.source_lang
            inputs = tokenizer(req.text, return_tensors="pt").to(device)

            target_lang_id = tokenizer.convert_tokens_to_ids(req.target_lang)
            generated_tokens = model.generate(
                **inputs,
                forced_bos_token_id=target_lang_id,
                max_length=512,
                num_beams=4,
                early_stopping=True,
            )

            translated = tokenizer.batch_decode(
                generated_tokens, skip_special_tokens=True
            )[0]

            return TranslateResponse(
                translated_text=translated,
                source_lang=req.source_lang,
                target_lang=req.target_lang,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/translate_batch", response_model=BatchTranslateResponse)
    def translate_batch(req: BatchTranslateRequest):
        if not req.texts:
            return BatchTranslateResponse(
                translations=[],
                source_lang=req.source_lang,
                target_lang=req.target_lang,
            )

        try:
            tokenizer.src_lang = req.source_lang
            inputs = tokenizer(
                req.texts, return_tensors="pt", padding=True, truncation=True
            ).to(device)

            target_lang_id = tokenizer.convert_tokens_to_ids(req.target_lang)
            generated_tokens = model.generate(
                **inputs,
                forced_bos_token_id=target_lang_id,
                max_length=512,
                num_beams=4,
                early_stopping=True,
            )

            translations = tokenizer.batch_decode(
                generated_tokens, skip_special_tokens=True
            )

            return BatchTranslateResponse(
                translations=translations,
                source_lang=req.source_lang,
                target_lang=req.target_lang,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return app


if __name__ == "__main__":
    if not DEPENDENCIES_AVAILABLE:
        create_app()
    else:
        app = create_app()
        uvicorn.run(app, host="0.0.0.0", port=PORT)
