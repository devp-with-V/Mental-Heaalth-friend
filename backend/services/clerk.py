import httpx
from jose import jwt
from fastapi import HTTPException
from core.config import settings

# Cache the JWKS to avoid fetching on every request
_jwks_cache = None

async def _get_clerk_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache
        
    if not settings.CLERK_SECRET_KEY:
        raise HTTPException(status_code=500, detail="CLERK_SECRET_KEY is not configured")
        
    async with httpx.AsyncClient() as client:
        # Fetch the JWKS from Clerk API using the Secret Key
        resp = await client.get(
            "https://api.clerk.com/v1/jwks",
            headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"}
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to fetch Clerk JWKS")
        _jwks_cache = resp.json()
        return _jwks_cache

async def verify_clerk_token(token: str) -> str:
    """
    Verifies a Clerk session token and returns the Clerk user ID (sub).
    """
    jwks = await _get_clerk_jwks()
    
    try:
        # Get the unverified header to find which key was used
        unverified_header = jwt.get_unverified_header(token)
        rsa_key = {}
        for key in jwks.get("keys", []):
            if key["kid"] == unverified_header["kid"]:
                rsa_key = {
                    "kty": key["kty"],
                    "kid": key["kid"],
                    "use": key["use"],
                    "n": key["n"],
                    "e": key["e"]
                }
                break
                
        if not rsa_key:
            raise HTTPException(status_code=401, detail="Unable to find appropriate key")
            
        # Decode and verify the token
        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=["RS256"]
        )
        
        # 'sub' is the Clerk user ID
        return payload.get("sub")
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Clerk token expired")
    except jwt.JWTClaimsError:
        raise HTTPException(status_code=401, detail="Invalid Clerk token claims")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Clerk token: {str(e)}")

async def get_clerk_user(user_id: str) -> dict:
    """
    Fetches the user details from the Clerk API.
    """
    if not settings.CLERK_SECRET_KEY:
        raise HTTPException(status_code=500, detail="CLERK_SECRET_KEY is not configured")
        
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.clerk.com/v1/users/{user_id}",
            headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"}
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to fetch Clerk user details")
        
        return resp.json()
