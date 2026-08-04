



import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from "@/hooks/use-toast";
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Heart, ShoppingBag, ShoppingCart, Star, Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState(1);
  const [isAddedToCart, setIsAddedToCart] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);

  const [reviewComment, setReviewComment] = useState('');
  const [reviewRating, setReviewRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [reviewImages, setReviewImages] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  
  // Track image loading states
  const [imageLoadingStates, setImageLoadingStates] = useState({});

  // Fetch product from Supabase
  const { data: product, isLoading, error } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Helper function to determine stock status (same as in Products.tsx)
  const getStockStatus = (product) => {
    if (!product) return { status: 'OUT_OF_STOCK', label: 'Out of Stock', color: 'text-red-600' };
    
    if (product.stock_quantity === 0) {
      return { status: 'OUT_OF_STOCK', label: 'Out of Stock', color: 'text-red-600' };
    } else if (product.stock_quantity <= product.min_stock_level) {
      return { status: 'LOW_STOCK', label: 'Low Stock', color: 'text-yellow-600' };
    } else {
      return { status: 'IN_STOCK', label: 'In Stock', color: 'text-green-600' };
    }
  };

  // Calculate stock status
  const stockInfo = useMemo(() => getStockStatus(product), [product]);
  const isOutOfStock = stockInfo.status === 'OUT_OF_STOCK';
  const isLowStock = stockInfo.status === 'LOW_STOCK';

  // Update quantity limits based on stock
  useEffect(() => {
    if (product && quantity > product.stock_quantity) {
      setQuantity(Math.max(1, product.stock_quantity));
    }
  }, [product, quantity]);

  // Fetch reviews from Supabase
  const { data: reviews = [], refetch: refetchReviews, isLoading: reviewsLoading, isError: reviewsError } = useQuery({
    queryKey: ['reviews', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('product_id', id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  // Calculate average rating
  const averageRating = useMemo(() => {
    return reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : 0;
  }, [reviews]);

  // Updated mutation for adding a review with better error handling
  const addReviewMutation = useMutation({
    mutationFn: async (newReview) => {
      let imageUrls = [];
      
      // Upload images if any
      if (newReview.images && newReview.images.length > 0) {
        setUploadingImages(true);
        try {
          const uploadPromises = newReview.images.map(async (file) => {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
            const filePath = `reviews/${fileName}`;

            // Upload the file to the storage bucket
            const { data, error } = await supabase.storage
              .from('product-images')
              .upload(filePath, file);

            if (error) {
              throw new Error(`File upload failed: ${error.message}`);
            }

            // Get the public URL of the uploaded file
            const { data: { publicUrl } } = supabase.storage
              .from('product-images')
              .getPublicUrl(filePath);

            return publicUrl;
          });
          
          imageUrls = await Promise.all(uploadPromises);
        } catch (error) {
          setUploadingImages(false);
          throw new Error(`Failed to upload images: ${error.message}`);
        } finally {
          setUploadingImages(false);
        }
      }
      
      // Prepare review data - Store as JSON array instead of PostgreSQL array
      const reviewData = {
        product_id: id,
        user_id: user?.id || null,
        rating: newReview.rating,
        comment: newReview.comment.trim(),
        images: imageUrls.length > 0 ? imageUrls : null
      };
      
      const { data, error } = await supabase
        .from('reviews')
        .insert([reviewData])
        .select();
      
      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews', id] });
      refetchReviews();
      setReviewComment('');
      setReviewRating(0);
      setReviewImages([]);
      toast({
        title: "Review submitted",
        description: "Thanks for your feedback."
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit review",
        variant: "destructive"
      });
    },
    onSettled: () => setSubmitting(false)
  });

  const handleAddToCart = async () => {
    // Check stock status first
    if (isOutOfStock) {
      toast({
        title: "Out of Stock",
        description: "This product is currently out of stock",
        variant: "destructive"
      });
      return;
    }

    if (!user) {
      toast({ title: "Login required", description: "Please login first", variant: "destructive" });
      navigate('/auth');
      return;
    }

    setIsAddingToCart(true);
    
    try {
      // Check existing cart item
      const { data: existing } = await supabase
        .from('cart_items')
        .select('*')
        .eq('user_id', user.id)
        .eq('product_id', id)
        .single();

      if (existing) {
        // Check if adding more would exceed stock
        if (existing.quantity + quantity > product.stock_quantity) {
          toast({
            title: "Not enough stock",
            description: `Only ${product.stock_quantity} items available. You already have ${existing.quantity} in your cart.`,
            variant: "destructive"
          });
          setIsAddingToCart(false);
          return;
        }

        await supabase.from('cart_items').update({
          quantity: existing.quantity + quantity,
          updated_at: new Date().toISOString()
        }).eq('id', existing.id);
      } else {
        // Check if requested quantity exceeds stock
        if (quantity > product.stock_quantity) {
          toast({
            title: "Not enough stock",
            description: `Only ${product.stock_quantity} items available`,
            variant: "destructive"
          });
          setIsAddingToCart(false);
          return;
        }

        await supabase.from('cart_items').insert({
          user_id: user.id,
          product_id: id,
          quantity
        });
      }

      queryClient.invalidateQueries({ queryKey: ['cart'] });
      setIsAddedToCart(true);
      toast({ title: "Added to cart" });
      setTimeout(() => setIsAddedToCart(false), 2000);
    } catch (error) {
      toast({ title: "Cart Error", description: error.message, variant: "destructive" });
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleBuyNow = () => {
    if (isOutOfStock) {
      toast({
        title: "Out of Stock",
        description: "This product is currently out of stock",
        variant: "destructive"
      });
      return;
    }

    if (!user) {
      toast({ title: "Login required", description: "Please login first", variant: "destructive" });
      navigate('/auth');
    } else {
      navigate('/checkout');
    }
  };

  const handleQuantityChange = (newQuantity) => {
    if (isOutOfStock) return;
    
    if (newQuantity > product.stock_quantity) {
      toast({
        title: "Not enough stock",
        description: `Only ${product.stock_quantity} items available`,
        variant: "destructive"
      });
      return;
    }
    
    setQuantity(Math.max(1, newQuantity));
  };

  const handleReviewSubmit = (e) => {
    e.preventDefault();
    
    if (!reviewComment.trim() || reviewRating === 0) {
      toast({ 
        title: "Incomplete", 
        description: "Please provide a rating and comment", 
        variant: "destructive" 
      });
      return;
    }
    
    if (!user) {
      toast({ 
        title: "Login required", 
        description: "Please login to submit a review", 
        variant: "destructive" 
      });
      return;
    }
    
    setSubmitting(true);
    addReviewMutation.mutate({ 
      rating: reviewRating, 
      comment: reviewComment,
      images: reviewImages
    });
  };

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    const maxImages = 3;
    const maxSize = 5 * 1024 * 1024; // 5MB per image
    
    if (reviewImages.length + files.length > maxImages) {
      toast({
        title: "Too many images",
        description: `You can only upload up to ${maxImages} images`,
        variant: "destructive"
      });
      return;
    }
    
    const validFiles = files.filter(file => {
      const isImage = file.type.startsWith('image/');
      const isValidSize = file.size <= maxSize;
      
      if (!isImage) {
        toast({
          title: "Invalid file type",
          description: "Please upload only image files",
          variant: "destructive"
        });
        return false;
      }
      
      if (!isValidSize) {
        toast({
          title: "File too large",
          description: "Each image must be less than 5MB",
          variant: "destructive"
        });
        return false;
      }
      
      return true;
    });
    
    setReviewImages(prev => [...prev, ...validFiles]);
  };

  const removeImage = (index) => {
    setReviewImages(prev => prev.filter((_, i) => i !== index));
  };

  // Function to parse image URLs from database
  const parseImageUrls = (images) => {
    if (!images) return [];
    if (Array.isArray(images)) {
      return images.map(url => {
        if (typeof url === 'string') {
          // If already a full URL, return as is
          if (url.startsWith('http')) return url;
          // If it's a relative path, build the full public URL
          return `https://xmkefhhhsslwceuvjiwb.supabase.co/storage/v1/object/product-images/${url.replace(/^\/?reviews\//, 'reviews/')}`;
        }
        // If object, try to extract url/publicUrl
        return url?.publicUrl || url?.url || '';
      }).filter(Boolean);
    }
    if (typeof images === 'string') {
      try {
        const parsed = JSON.parse(images);
        return parseImageUrls(parsed);
      } catch {
        return images.split(',').map(url => url.trim()).filter(Boolean);
      }
    }
    return [];
  };

  // Handle image loading states
  const handleImageLoad = (imageKey) => {
    setImageLoadingStates(prev => ({
      ...prev,
      [imageKey]: 'loaded'
    }));
  };

  const handleImageError = (imageKey) => {
    setImageLoadingStates(prev => ({
      ...prev,
      [imageKey]: 'error'
    }));
  };

  const renderStars = (rating, interactive = false, onClick = () => {}) => (
    <div className="flex">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-5 w-5 ${interactive ? 'cursor-pointer' : ''} ${rating >= i ? 'text-yellow-500' : 'text-gray-300'}`}
          fill={rating >= i ? "#F5C62A" : "none"}
          onClick={interactive ? () => onClick(i) : undefined}
        />
      ))}
    </div>
  );

  if (isLoading) return <div className="pt-32 pb-20 text-center">Loading product...</div>;
  if (error || !product) return <div className="pt-32 pb-20 text-center">Product not found</div>;

  return (
    <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-24 pb-20">
      <div className="section-container">
        <button onClick={() => navigate('/products')} className="text-sm mb-4 flex items-center text-gray-500">
          <ArrowLeft className="mr-2" /> Back
        </button>
        <div className="grid md:grid-cols-2 gap-10">
          <div className="relative">
            
           <div className="w-full max-w-[600px] mx-auto p-2 sm:p-4">
              <img
                src={product.image || '/placeholder.png'}
                alt={product.title}
                className="w-full h-[250px] sm:h-[600px] object-cover rounded-2xl shadow-md"
              />
            </div>
            
            {/* Stock Status Overlay */}
            {isOutOfStock && (
              <div className="absolute inset-0 bg-gray-900/50 flex items-center justify-center rounded-xl">
                <span className="bg-red-600 text-white px-4 py-2 rounded-md font-semibold">
                  Out of Stock
                </span>
              </div>
            )}
          </div>
          <div>
            <h1 className="text-3xl font-bold mb-2">{product.title}</h1>
            
            {/* Stock Status Display */}
            <div className="mb-4">
              <span className={`text-sm font-medium ${stockInfo.color}`}>
                {stockInfo.label}
              </span>
              {product.stock_quantity > 0 && (
                <span className="text-sm text-gray-600 ml-2">
                  ({product.stock_quantity} available)
                </span>
              )}
            </div>

            <div className="mb-4 flex items-center space-x-2">
              {renderStars(Math.round(averageRating))}
              <span className="text-sm text-gray-600">({reviews.length} review{reviews.length !== 1 ? 's' : ''})</span>
              {averageRating > 0 && (
                <span className="ml-2 text-xs text-gray-500">{averageRating.toFixed(1)} avg</span>
              )}
            </div>
            <div className="text-xl font-bold text-brand-red mb-6">₹{product.price}</div>
            <p className="mb-4 text-gray-700">{product.full_description || product.description}</p>
            <div className="space-y-3 mb-8">
              <h3 className="font-semibold text-lg">Benefits:</h3>
              <div className="flex items-start"><Check className="h-5 w-5 text-green-500 mr-2 mt-0.5" /><span>100% organic from native Sahiwal cows</span></div>
              <div className="flex items-start"><Check className="h-5 w-5 text-green-500 mr-2 mt-0.5" /><span>Made using traditional Bilona method</span></div>
              <div className="flex items-start"><Check className="h-5 w-5 text-green-500 mr-2 mt-0.5" /><span>No preservatives or additives</span></div>
              <div className="flex items-start"><Check className="h-5 w-5 text-green-500 mr-2 mt-0.5" /><span>Rich in nutrients and easy to digest</span></div>
            </div>
            
            {/* Quantity Section - Updated with stock validation */}
            <div className="mb-8">
              <h3 className="font-semibold text-lg mb-3">Quantity:</h3>
              <div className="flex items-center">
                <button 
                  onClick={() => handleQuantityChange(quantity - 1)} 
                  className={`px-3 py-1 border rounded-l-lg ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                  disabled={isOutOfStock || quantity <= 1}
                >
                  -
                </button>
                <span className="px-4 py-1 border-t border-b bg-gray-50">{quantity}</span>
                <button 
                  onClick={() => handleQuantityChange(quantity + 1)} 
                  className={`px-3 py-1 border rounded-r-lg ${isOutOfStock || quantity >= product.stock_quantity ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                  disabled={isOutOfStock || quantity >= product.stock_quantity}
                >
                  +
                </button>
              </div>
              {isLowStock && !isOutOfStock && (
                <p className="text-xs text-yellow-600 mt-1">Only {product.stock_quantity} left in stock!</p>
              )}
            </div>

            {/* Action Buttons - Updated with stock validation */}
            <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <Button 
                onClick={handleAddToCart} 
                disabled={isAddedToCart || isAddingToCart || isOutOfStock}
                className={isOutOfStock ? 'bg-gray-400 hover:bg-gray-400 cursor-not-allowed' : ''}
              >
                {isOutOfStock ? 'Out of Stock' : isAddedToCart ? (
                  <>
                    <Check className="mr-2 h-5 w-5" />
                    Added to Cart
                  </>
                ) : isAddingToCart ? (
                  <>
                    <span className="mr-2">Adding...</span>
                  </>
                ) : (
                  <>
                    <ShoppingCart className="mr-2 h-5 w-5" />
                    Add to Cart
                  </>
                )}
              </Button>
              <Button
                onClick={handleBuyNow}
                variant="outline"
                disabled={isAddingToCart || isOutOfStock}
                className={isOutOfStock ? 'opacity-50 cursor-not-allowed' : ''}
              >
                <ShoppingBag className="mr-2 h-5 w-5" />
                {isOutOfStock ? 'Out of Stock' : 'Buy Now'}
              </Button>
            </div>
            
            <div className="glass-panel p-4 mb-6">
              <div className="flex items-start">
                <Truck className="h-5 w-5 text-brand-red mr-3 mt-0.5" />
                <div>
                  <h4 className="font-medium">Free Delivery</h4>
                  <p className="text-sm text-gray-600">Orders above ₹500</p>
                </div>
              </div>
            </div>
            <button className="flex items-center text-gray-600 hover:text-brand-red transition-colors">
              <Heart className="h-5 w-5 mr-2" />
              Add to Wishlist
            </button>
          </div>
        </div>

        {/* Product Description Tabs */}
        <div className="mt-20">
          <h2 className="text-2xl font-display font-bold mb-6">Product Details</h2>
          <div className="glass-panel p-6">
            <h3 className="font-semibold text-lg mb-4">Description</h3>
            <p className="text-gray-700 mb-6">
              {product.full_description || `Our ${product.title} is sourced from our farm's Sahiwal cows, which are fed with organic fodder and raised in a natural environment. This product is made using the traditional Bilona method, which preserves all the natural goodness and flavor of the milk.`}
            </p>
            <h3 className="font-semibold text-lg mb-4">How to Use</h3>
            <p className="text-gray-700 mb-6">
              {product.usage_instructions || `Store in a cool, dry place. Once opened, refrigerate and consume within the recommended time for maximum freshness and flavor.`}
            </p>
            <h3 className="font-semibold text-lg mb-4">Ingredients</h3>
            <p className="text-gray-700">
              {product.ingredients || `100% A2 Sahiwal cow milk. No preservatives, additives, or artificial flavors.`}
            </p>
          </div>
        </div>

        {/* Review Section */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold mb-4">Reviews</h2>
          {reviewsLoading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand-red"></div>
              <p className="mt-2 text-gray-500">Loading reviews...</p>
            </div>
          ) : reviewsError ? (
            <div className="text-center py-8">
              <p className="text-red-500">Error loading reviews. Please try again later.</p>
            </div>
          ) : reviews.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No reviews yet. Be the first to review this product!</p>
            </div>
          ) : (
            reviews.map((review) => {
              const reviewImageUrls = parseImageUrls(review.images);

              return (
                <div key={review.id} className="border-b py-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {review.user_id ? 'Customer' : 'Anonymous'}
                    </span>
                    {renderStars(review.rating)}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{review.comment}</p>
                  
                  {/* Fixed image display section */}
                  {reviewImageUrls.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-gray-500 mb-2">Review Images:</p>
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {reviewImageUrls.map((imageUrl, index) => {
                          const imageKey = `review-${review.id}-img-${index}`;
                          const loadingState = imageLoadingStates[imageKey];
                          
                          // Ensure the URL is properly formatted
                          let fullImageUrl = imageUrl;
                          if (!imageUrl.startsWith('http')) {
                            fullImageUrl = `https://${imageUrl}`;
                          }
                          
                          return (
                            <div 
                              key={imageKey} 
                              className="flex-shrink-0 relative cursor-pointer"
                              onClick={() => window.open(fullImageUrl, '_blank')}
                            >
                              <img
                                src={fullImageUrl}
                                alt={`Review image ${index + 1}`}
                                className="w-20 h-20 object-cover rounded-lg hover:opacity-80 transition-opacity border shadow-sm"
                                onLoad={() => handleImageLoad(imageKey)}
                                onError={() => handleImageError(imageKey)}
                                style={{ 
                                  display: loadingState === 'error' ? 'none' : 'block'
                                }}
                              />
                              
                              {/* Loading indicator - only show while loading */}
                              {!loadingState && (
                                <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg">
                                  <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                                </div>
                              )}
                              
                              {/* Error placeholder */}
                              {loadingState === 'error' && (
                                <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center border">
                                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-gray-400">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="2"/>
                                    <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="2"/>
                                    <polyline points="21,15 16,10 5,21" stroke="currentColor" strokeWidth="2"/>
                                  </svg>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  <p className="text-xs text-gray-400 mt-2">
                    {new Date(review.created_at).toLocaleDateString()}
                  </p>
                </div>
              );
            })
          )}

          <form onSubmit={handleReviewSubmit} className="mt-6 space-y-4">
            <textarea
              value={reviewComment}
              onChange={e => setReviewComment(e.target.value)}
              placeholder="Write your review here..."
              className="w-full p-3 border rounded-lg resize-none"
              rows="4"
              required
              maxLength={500}
            />
            
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium">Rating:</span>
              {renderStars(reviewRating, true, setReviewRating)}
            </div>
            
            {/* Image Upload Section */}
            <div className="space-y-3">
              <label className="block text-sm font-medium">Add Photos (Optional)</label>
              <div className="flex items-center space-x-4">
                <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg transition-colors">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    disabled={reviewImages.length >= 3}
                  />
                  <span className="text-sm">
                    {reviewImages.length >= 3 ? 'Max 3 images' : 'Choose Images'}
                  </span>
                </label>
                <span className="text-xs text-gray-500">
                  {reviewImages.length}/3 images (Max 5MB each)
                </span>
              </div>
              
              {/* Preview selected images */}
              {reviewImages.length > 0 && (
                <div className="flex gap-2 mt-3">
                  {reviewImages.map((file, index) => (
                    <div key={index} className="relative">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={`Preview ${index + 1}`}
                        className="w-16 h-16 object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <Button 
              type="submit" 
              disabled={submitting || uploadingImages || !reviewComment.trim() || reviewRating === 0}
              className="w-full sm:w-auto"
            >
              {uploadingImages ? 'Uploading Images...' : submitting ? 'Submitting...' : 'Submit Review'}
            </Button>
          </form>
        </div>
      </div>
    </motion.main>
  );
};

export default ProductDetail;
