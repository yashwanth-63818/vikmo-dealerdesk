from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import APIException
from django.core.exceptions import ObjectDoesNotExist
from django.db import IntegrityError

class CustomAPIException(APIException):
    def __init__(self, code, message, status_code=status.HTTP_400_BAD_REQUEST, details=None):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or []
        super().__init__(detail=message)

def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if isinstance(exc, CustomAPIException):
        return Response({
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details
            }
        }, status=exc.status_code)

    if response is not None:
        # Standard DRF validation error
        if response.status_code == status.HTTP_400_BAD_REQUEST:
            details = []
            if isinstance(response.data, dict):
                for field, errors in response.data.items():
                    if isinstance(errors, list):
                        for error in errors:
                            details.append({"field": field, "message": str(error)})
                    else:
                        details.append({"field": field, "message": str(errors)})
            elif isinstance(response.data, list):
                for error in response.data:
                    details.append({"message": str(error)})
            
            return Response({
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Invalid input",
                    "details": details
                }
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if response.status_code == status.HTTP_404_NOT_FOUND:
            return Response({
                "error": {
                    "code": "NOT_FOUND",
                    "message": "Resource not found",
                    "details": []
                }
            }, status=status.HTTP_404_NOT_FOUND)

    # Handle standard django 404
    if isinstance(exc, ObjectDoesNotExist):
        return Response({
            "error": {
                "code": "NOT_FOUND",
                "message": "Resource not found",
                "details": []
            }
        }, status=status.HTTP_404_NOT_FOUND)

    # Handle integrity errors (duplicate PK)
    if isinstance(exc, IntegrityError):
        return Response({
            "error": {
                "code": "DUPLICATE",
                "message": "A duplicate record already exists",
                "details": []
            }
        }, status=status.HTTP_409_CONFLICT)

    # Fallback for unhandled errors
    return response
