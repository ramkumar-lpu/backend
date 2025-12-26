import { Router } from "express";
import { HfInference } from "@huggingface/inference";
import dotenv from "dotenv";

dotenv.config();
export const suggestionRouter = Router();

// Ensure your .env has: HF_TOKEN=hf_your_actual_token_here
const hf = new HfInference(process.env.HF_TOKEN);

suggestionRouter.post('/generate-shoe', async (req, res) => {
  const { prompt } = req.body;

  try {
    // Model strategy: SDXL is often more reliable on the free tier than SD3
    const modelId = "stabilityai/stable-diffusion-xl-base-1.0"; 

   const response = await hf.textToImage({
    model: modelId,
    inputs: `
  single custom sneaker, professional 3D product render,
  ${prompt},
  ultra realistic materials, clean stitching, detailed sole,
  studio lighting, soft shadows, sharp focus,
  white seamless background, centered product shot,
  high detail, premium product photography
  `,
    parameters: {
      negative_prompt: `
  low quality, blurry, distorted, extra shoes, pair of shoes,
  bad anatomy, messy background, text, logo, watermark,
  cartoon, anime, illustration, noise, grain
      `,
      guidance_scale: 6.5,
      num_inference_steps: 30
    }
  });


    // Convert the returned Blob to a Base64 string for the React frontend
    const arrayBuffer = await response.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');
    const dataUrl = `data:image/png;base64,${base64Image}`;

    res.json({ success: true, imageUrl: dataUrl });

  } catch (error) {
    console.error("Hugging Face Error:", error.message);
    
    // Specifically catch the 401 and explain it
    if (error.message.includes("401")) {
      return res.status(401).json({ 
        success: false, 
        error: "Invalid API Token. Please check your HF_TOKEN in the .env file." 
      });
    }

    res.status(500).json({ success: false, error: "AI service is currently busy. Try again in 30 seconds." });
  }
});