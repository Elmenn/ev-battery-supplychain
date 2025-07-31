import React from 'react';
import { Button, Chip } from '@mui/material';
import { Shield, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const RailgunNavButton = ({ variant = "outlined", size = "medium" }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate('/railgun');
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      startIcon={<Shield size={16} />}
      sx={{
        background: variant === "contained" ? 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)' : 'transparent',
        border: variant === "outlined" ? '1px solid #2196F3' : 'none',
        color: variant === "contained" ? 'white' : '#2196F3',
        '&:hover': {
          background: variant === "contained" 
            ? 'linear-gradient(45deg, #1976D2 30%, #1E88E5 90%)' 
            : 'rgba(33, 150, 243, 0.04)',
        },
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        Private Payments
        <Chip 
          label="NEW" 
          size="small" 
          color="success" 
          sx={{ 
            height: '16px', 
            fontSize: '10px',
            ml: 1
          }} 
        />
      </span>
    </Button>
  );
};

export default RailgunNavButton; 