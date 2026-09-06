import logging
import time
import torch
from sentence_transformers import SentenceTransformer
# Assuming standard VectorAI SDK import
from vectorai import ViClient 

# --- Logging Configuration ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Custom Exceptions ---
class TaskStorageError(Exception):
    """Base exception for TaskStorage."""
    pass

class TaskNotFoundError(TaskStorageError):
    """Raised when a task cannot be found."""
    pass

# --- Core Implementation ---
class TaskStorage:
    def __init__(self, host="localhost", port=6574):
        self.model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
        self._connect_with_backoff(host, port)
        
        # Ensure collections exist
        self.client.get_or_create_collection("tasks")
        self.client.get_or_create_collection("completed_tasks")

    def _connect_with_backoff(self, host, port):
        retries = 5
        backoff = 0.5
        for i in range(retries):
            try:
                self.client = ViClient(url=f"http://{host}:{port}")
                # Try a simple ping or info check if SDK provides one
                logger.info("Connected to VectorAI DB.")
                return
            except Exception as e:
                logger.warning(f"Connection attempt {i+1} failed: {e}. Retrying in {backoff}s...")
                time.sleep(backoff)
                backoff *= 2
        raise TaskStorageError("Failed to connect to VectorAI DB after multiple retries.")

    def _embed_text(self, text: str) -> list[float]:
        vector = self.model.encode(text).tolist()
        # Dimension Validation
        if len(vector) != 384:
            raise TaskStorageError(f"Embedding dimension mismatch: expected 384, got {len(vector)}")
        return vector

    def save_task(self, task: dict) -> str:
        """Embeds title+description, upserts into 'tasks' collection, returns task_id."""
        text = f"{task['title']} {task['description']}"
        vector = self._embed_text(text)
        
        task_id = task.get("id") or str(hash(text)) # Simplistic ID generation
        
        payload = {
            "id": task_id,
            "vector": vector,
            **task
        }
        
        self.client.upsert("tasks", [payload])
        return task_id

    def get_task(self, task_id: str) -> dict:
        """Retrieves a task payload by task_id."""
        result = self.client.get_document("tasks", task_id)
        if not result:
            raise TaskNotFoundError(f"Task {task_id} not found.")
        return result

    def find_similar_tasks(self, title: str, description: str, limit: int) -> list[dict]:
        """Searches 'completed_tasks' using points.search, returns top N matches."""
        query_text = f"{title} {description}"
        vector = self._embed_text(query_text)
        
        # Using points.search as required
        results = self.client.points.search(
            collection="completed_tasks",
            vector=vector,
            limit=limit
        )
        return results

    def archive_completed(self, task_id: str) -> None:
        """Moves task from 'tasks' to 'completed_tasks'."""
        task = self.get_task(task_id)
        # Add to completed
        self.client.upsert("completed_tasks", [task])
        # Remove from active
        self.client.delete_document("tasks", task_id)
        logger.info(f"Task {task_id} archived.")

    def count_vectors(self) -> int:
        """Returns total vector count across both collections."""
        count = self.client.get_collection_count("tasks") + \
                self.client.get_collection_count("completed_tasks")
        
        if count >= 4500:
            logger.warning(f"Capacity warning: {count} vectors stored. Approaching 5,000 threshold.")
        
        return count

# --- Validation Test ---
if __name__ == "__main__":
    try:
        storage = TaskStorage()
        
        # 1. Create a task
        new_task = {
            "user_id": "user1",
            "title": "Fix database bug",
            "description": "The connection drops on high load.",
            "status": "active",
            "damage_rating": 5,
            "deadline_seconds": 3600
        }
        task_id = storage.save_task(new_task)
        logger.info(f"Task created: {task_id}")

        # 2. Archive it
        storage.archive_completed(task_id)

        # 3. Search
        similar = storage.find_similar_tasks("Database", "connection issue", limit=1)
        logger.info(f"Search results: {similar}")

        # 4. Count
        total = storage.count_vectors()
        logger.info(f"Total vector count: {total}")

    except Exception as e:
        logger.error(f"Test failed: {e}")
