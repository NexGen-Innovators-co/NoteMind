import React from 'react';

interface ImageRendererProps {
    imageUrl: string;
}

export const ImageRenderer: React.FC<ImageRendererProps> = ({ imageUrl }) => {
    return (
        <img src={imageUrl} alt="Generated Image" className="max-w-full h-auto object-contain rounded-lg shadow-md mx-auto"  />
    );
};