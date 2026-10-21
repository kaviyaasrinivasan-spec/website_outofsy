# app/pagination.py
"""Shared pagination.

Every list endpoint must use this. Returning `.all()` on a table that grows
with the business works fine at 8 rows and falls over at 10,000 -- the query
holds a connection while serialising the entire table into one JSON response.
"""
from typing import Any, Callable, Optional, TypeVar

from fastapi import Query
from sqlalchemy.orm import Query as SAQuery

T = TypeVar("T")

DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 200


class PageParams:
    """FastAPI dependency: `params: PageParams = Depends()`."""

    def __init__(
        self,
        page: int = Query(1, ge=1, description="1-based page number"),
        page_size: int = Query(
            DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE,
            description=f"Rows per page (max {MAX_PAGE_SIZE})",
        ),
    ):
        self.page = page
        self.page_size = page_size

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def paginate(
    query: SAQuery,
    params: PageParams,
    serializer: Optional[Callable[[Any], Any]] = None,
) -> dict:
    """Run a count + one page of rows, and return a consistent envelope.

    The shape is identical everywhere so the operations UI can share one
    table component across every list screen.
    """
    total = query.order_by(None).count()
    rows = query.offset(params.offset).limit(params.page_size).all()
    items = [serializer(r) for r in rows] if serializer else rows

    total_pages = (total + params.page_size - 1) // params.page_size if total else 0
    return {
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
        "total_pages": total_pages,
        "has_next": params.page < total_pages,
        "has_prev": params.page > 1,
    }
